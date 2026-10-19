const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendResetOtpEmail } = require('../utils/mailer');
const supabase = require('../config/supabase');
const {
  isAdminBlocked,
  setAdminBlocked,
  isAdminArchived,
  setAdminArchived,
  getAdminBlockReason,
  setAdminBlockReason,
} = require('../utils/archiveStore');
const { normalizeBlockReason, blockedAccountMessage } = require('../utils/blockReasons');
const { logActivity } = require('../utils/activityLogger');

const ADMIN_ROLES = ['Admin', 'User'];

// POST /api/admin/register
router.post('/register', async (req, res) => {
  const { first_name, middle_name, last_name, username, password, role, contact_number, email } = req.body;

  if (!first_name || !last_name || !username || !password) {
    return res.status(400).json({ message: 'First name, last name, username, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  const assignedRole = role || 'Admin';
  if (!ADMIN_ROLES.includes(assignedRole)) {
    return res.status(400).json({ message: 'Invalid role. Use Admin or User.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('admin')
      .insert([
        {
          first_name,
          middle_name: middle_name || null,
          last_name,
          username,
          password: hashedPassword,
          role: assignedRole,
          contact_number: contact_number || null,
          email: String(email || '').trim().toLowerCase() || null,
        },
      ])
      .select('admin_id, first_name, middle_name, last_name, username, role, contact_number, email')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Username already taken. Choose another.' });
      }
      return res.status(500).json({ message: error.message });
    }

    const token = jwt.sign(
      { admin_id: data.admin_id, username: data.username, role: data.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logActivity(req, {
      action: 'admin.create',
      entity_type: 'admin',
      entity_id: data.admin_id,
      target: `@${data.username}`,
      details: `Created admin account @${data.username} (${data.first_name} ${data.last_name}) with role ${data.role}.`,
    });

    return res.status(201).json({
      message: 'Admin account created successfully!',
      admin: data,
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/admin/list  — fetch all admins (no passwords)
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('admin_id, first_name, middle_name, last_name, username, role, contact_number, email')
      .order('admin_id', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    const rows = (data || []).map((admin) => {
      const archived = isAdminArchived(admin.admin_id);
      const blocked = isAdminBlocked(admin.admin_id);
      return {
        ...admin,
        account_status: archived ? 'Deleted' : (blocked ? 'Blocked' : 'Active'),
        block_reason: !archived && blocked ? getAdminBlockReason(admin.admin_id) : null,
      };
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── Forgot password via email OTP ─────────────────────────────────────────────
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MS = 60 * 1000;
const otpStore = new Map(); // admin_id -> { hash, expires, attempts, sentAt }
const usedResetTokens = new Set();

const GENERIC_REQUEST_MSG = 'If that account exists, a verification code was sent to the registered email.';

// POST /api/admin/forgot-password/request
router.post('/forgot-password/request', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!username) return res.status(400).json({ message: 'Username is required.' });

  try {
    const { data } = await supabase
      .from('admin')
      .select('admin_id, username, email')
      .eq('username', username)
      .maybeSingle();

    if (data && !isAdminArchived(data.admin_id) && !isAdminBlocked(data.admin_id)) {
      const existing = otpStore.get(data.admin_id);
      if (existing && Date.now() - existing.sentAt < OTP_RESEND_MS) {
        return res.status(429).json({ message: 'Please wait a minute before requesting another code.' });
      }
      const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      otpStore.set(data.admin_id, {
        hash: await bcrypt.hash(otp, 10),
        expires: Date.now() + OTP_MINUTES * 60 * 1000,
        attempts: 0,
        sentAt: Date.now(),
      });
      const to = data.email || process.env.ADMIN_RESET_EMAIL || process.env.SMTP_USER;
      await sendResetOtpEmail(to, data.username, otp, OTP_MINUTES);
    }
    // Same response whether or not the account exists.
    return res.json({ message: GENERIC_REQUEST_MSG });
  } catch (err) {
    return res.status(500).json({ message: 'Could not send the verification code. Please try again.' });
  }
});

// POST /api/admin/forgot-password/verify
router.post('/forgot-password/verify', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const otp = String(req.body?.otp || '').trim();
  const invalid = () => res.status(400).json({ message: 'Invalid or expired code.' });

  if (!username || !/^\d{6}$/.test(otp)) return invalid();

  try {
    const { data } = await supabase
      .from('admin')
      .select('admin_id')
      .eq('username', username)
      .maybeSingle();
    const entry = data && otpStore.get(data.admin_id);
    if (!entry || Date.now() > entry.expires) {
      if (data) otpStore.delete(data.admin_id);
      return invalid();
    }
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(data.admin_id);
      return res.status(429).json({ message: 'Too many attempts. Request a new code.' });
    }
    entry.attempts += 1;
    if (!(await bcrypt.compare(otp, entry.hash))) return invalid();

    otpStore.delete(data.admin_id);
    const reset_token = jwt.sign(
      { admin_id: data.admin_id, purpose: 'admin_password_reset', jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    return res.json({ message: 'Code verified.', reset_token });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/admin/forgot-password/reset
router.post('/forgot-password/reset', async (req, res) => {
  const { reset_token, password } = req.body;
  if (!reset_token || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required.' });
  }
  if (String(password).length < 8 || !/[A-Za-z]/.test(String(password)) || !/\d/.test(String(password))) {
    return res.status(400).json({ field: 'password', message: 'Password must be at least 8 characters with a letter and a number.' });
  }

  try {
    const decoded = jwt.verify(reset_token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'admin_password_reset' || !decoded.admin_id || usedResetTokens.has(decoded.jti)) {
      return res.status(403).json({ message: 'Invalid or expired reset session. Please start again.' });
    }
    const hashed = await bcrypt.hash(String(password), 10);
    const { data, error } = await supabase
      .from('admin')
      .update({ password: hashed })
      .eq('admin_id', decoded.admin_id)
      .select('admin_id, username, role')
      .single();
    if (error || !data) return res.status(500).json({ message: 'Could not update password.' });

    usedResetTokens.add(decoded.jti);
    logActivity(req, {
      admin_id: data.admin_id,
      username: data.username,
      role: data.role,
      action: 'admin.password_reset',
      entity_type: 'admin',
      entity_id: data.admin_id,
      target: `@${data.username}`,
      details: 'Reset password via email verification code.',
    });
    return res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired reset session. Please start again.' });
  }
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('admin')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    if (isAdminArchived(data.admin_id)) {
      return res.status(403).json({
        message: 'This admin account is no longer available. Contact another administrator.',
      });
    }

    if (isAdminBlocked(data.admin_id)) {
      return res.status(403).json({
        message: blockedAccountMessage(getAdminBlockReason(data.admin_id)),
      });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { admin_id: data.admin_id, username: data.username, role: data.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _pwd, ...adminWithoutPassword } = data;

    logActivity(req, {
      admin_id: data.admin_id,
      username: data.username,
      role: data.role,
      action: 'admin.login',
      entity_type: 'admin',
      entity_id: data.admin_id,
      target: `@${data.username}`,
      details: `Signed in to the admin control panel as ${data.role}.`,
    });

    return res.json({
      message: 'Login successful!',
      admin: adminWithoutPassword,
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

const ADMIN_SAFE_FIELDS = 'admin_id, first_name, middle_name, last_name, username, role, contact_number, email';

// PATCH /api/admin/:id — edit admin (must stay after /list, /register, /login)
router.patch('/:id', async (req, res) => {
  const { first_name, middle_name, last_name, username, role, contact_number, email, password, account_status, block_reason } = req.body;
  const updates = {};

  if (first_name !== undefined) updates.first_name = first_name.trim();
  if (middle_name !== undefined) updates.middle_name = middle_name.trim() || null;
  if (last_name !== undefined) updates.last_name = last_name.trim();
  if (username !== undefined) updates.username = username.trim();
  if (contact_number !== undefined) updates.contact_number = contact_number.trim() || null;
  if (email !== undefined) {
    const cleaned = String(email).trim().toLowerCase();
    if (cleaned && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    updates.email = cleaned || null;
  }
  if (role !== undefined) {
    if (!ADMIN_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }
    updates.role = role;
  }
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    updates.password = await bcrypt.hash(password, 10);
  }

  if (account_status !== undefined && !['Active', 'Blocked', 'Deleted'].includes(account_status)) {
    return res.status(400).json({ message: 'Invalid status. Use Active, Blocked, or Deleted.' });
  }

  if (Object.keys(updates).length === 0 && account_status === undefined) {
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    let data = null;
    if (Object.keys(updates).length > 0) {
      const result = await supabase
        .from('admin')
        .update(updates)
        .eq('admin_id', req.params.id)
        .select(ADMIN_SAFE_FIELDS)
        .single();

      if (result.error) {
        if (result.error.code === '23505') {
          return res.status(409).json({ message: 'Username already taken.' });
        }
        return res.status(500).json({ message: result.error.message });
      }
      if (!result.data) return res.status(404).json({ message: 'Admin not found.' });
      data = result.data;
    } else {
      const result = await supabase
        .from('admin')
        .select(ADMIN_SAFE_FIELDS)
        .eq('admin_id', req.params.id)
        .single();
      if (result.error || !result.data) return res.status(404).json({ message: 'Admin not found.' });
      data = result.data;
    }

    if (account_status !== undefined) {
      if (account_status === 'Deleted') {
        setAdminArchived(req.params.id, true);
        setAdminBlockReason(req.params.id, null);
      } else {
        setAdminArchived(req.params.id, false);
        setAdminBlocked(req.params.id, account_status === 'Blocked');
        if (account_status === 'Blocked') {
          setAdminBlockReason(req.params.id, normalizeBlockReason(block_reason) || 'admin');
        } else {
          setAdminBlockReason(req.params.id, null);
        }
      }
    }

    const archived = isAdminArchived(req.params.id);
    const blocked = isAdminBlocked(req.params.id);
    const status = archived ? 'Deleted' : (blocked ? 'Blocked' : 'Active');
    const changed = Object.keys(updates);
    let action = 'admin.update';
    let details = `Updated admin @${data.username}.`;
    if (account_status === 'Blocked') {
      action = 'admin.block';
      details = `Blocked admin @${data.username}${block_reason ? ` (reason: ${block_reason})` : ''}.`;
    } else if (account_status === 'Deleted') {
      action = 'admin.archive';
      details = `Moved admin @${data.username} to archive.`;
    } else if (account_status === 'Active' && !changed.length) {
      action = 'admin.restore';
      details = `Restored admin @${data.username} to Active.`;
    } else if (updates.password) {
      details = `Changed password and profile for admin @${data.username}.`;
    } else if (changed.length) {
      details = `Updated admin @${data.username} fields: ${changed.filter((k) => k !== 'password').join(', ') || 'profile'}.`;
    }

    logActivity(req, {
      action,
      entity_type: 'admin',
      entity_id: req.params.id,
      target: `@${data.username}`,
      details,
    });

    return res.json({
      ...data,
      account_status: status,
      block_reason: !archived && blocked ? getAdminBlockReason(req.params.id) : null,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/admin/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('admin')
      .delete()
      .eq('admin_id', req.params.id);

    if (error) return res.status(500).json({ message: error.message });
    setAdminBlocked(req.params.id, false);
    setAdminArchived(req.params.id, false);
    setAdminBlockReason(req.params.id, null);
    logActivity(req, {
      action: 'admin.delete',
      entity_type: 'admin',
      entity_id: req.params.id,
      target: `Admin #${req.params.id}`,
      details: `Permanently deleted admin #${req.params.id}.`,
    });
    return res.json({ message: 'Admin deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
