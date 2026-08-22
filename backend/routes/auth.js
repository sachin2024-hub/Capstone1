const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const authenticateToken = require('../middleware/auth');
const { getUserBlockReason, setUserBlockReason } = require('../utils/archiveStore');
const { BLOCK_REASONS, blockedAccountMessage } = require('../utils/blockReasons');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { first_name, middle_name, last_name, phone_number, email, password, address } = req.body;

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: 'First name, last name, email, and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = phone_number ? String(phone_number).trim() : '';

    const { data: existingEmail } = await supabase
      .from('users')
      .select('user_id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingEmail) {
      return res.status(409).json({
        field: 'email',
        message: 'This email address is already registered. Please use a different email address.',
      });
    }

    if (normalizedPhone) {
      const { data: existingPhone } = await supabase
        .from('users')
        .select('user_id')
        .eq('phone_number', normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (existingPhone) {
        return res.status(409).json({
          field: 'phone_number',
          message: 'This mobile number is already registered. Please use a different mobile number.',
        });
      }
    }

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          first_name,
          middle_name: middle_name || null,
          last_name,
          phone_number: normalizedPhone || null,
          email: normalizedEmail,
          password: hashedPassword,
          address: address || null,
          account_status: 'Active',
        },
      ])
      .select('user_id, first_name, middle_name, last_name, email, phone_number, address, account_status')
      .single();

    if (error) {
      if (error.code === '23505') {
        const info = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
        if (info.includes('phone')) {
          return res.status(409).json({
            field: 'phone_number',
            message: 'This mobile number is already registered. Please use a different mobile number.',
          });
        }
        return res.status(409).json({
          field: 'email',
          message: 'This email address is already registered. Please use a different email address.',
        });
      }
      return res.status(500).json({ message: error.message });
    }

    const token = jwt.sign(
      { user_id: data.user_id, email: data.email },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    return res.status(201).json({
      message: 'Registration successful!',
      user: data,
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (data.account_status === 'Blocked') {
      return res.status(403).json({
        message: blockedAccountMessage(getUserBlockReason(data.user_id)),
      });
    }

    if (data.account_status !== 'Active') {
      return res.status(403).json({ message: 'Your account is inactive. Contact support.' });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { user_id: data.user_id, email: data.email },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    const { password: _password, ...userWithoutPassword } = data;

    return res.json({
      message: 'Login successful!',
      user: userWithoutPassword,
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/forgot-password/verify
router.post('/forgot-password/verify', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone_number = String(req.body?.phone_number || '').trim();

  if (!email || !phone_number) {
    return res.status(400).json({ message: 'Email and mobile number are required.' });
  }

  try {
    const { data } = await supabase
      .from('users')
      .select('user_id, email, phone_number, account_status')
      .ilike('email', email)
      .eq('phone_number', phone_number)
      .maybeSingle();

    if (!data) {
      return res.status(404).json({
        message: 'No account matches that email and mobile number.',
      });
    }

    if (data.account_status === 'Blocked') {
      return res.status(403).json({
        message: blockedAccountMessage(getUserBlockReason(data.user_id)),
      });
    }

    if (data.account_status !== 'Active') {
      return res.status(403).json({ message: 'This account cannot reset its password. Contact support.' });
    }

    const reset_token = jwt.sign(
      { user_id: data.user_id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({
      message: 'Account verified. You can now set a new password.',
      reset_token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/forgot-password/reset
router.post('/forgot-password/reset', async (req, res) => {
  const { reset_token, password } = req.body;

  if (!reset_token || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const decoded = jwt.verify(reset_token, process.env.JWT_SECRET);
    if (!decoded || decoded.purpose !== 'password_reset' || !decoded.user_id) {
      return res.status(403).json({ message: 'Invalid or expired reset link. Please verify again.' });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('user_id', decoded.user_id);

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired reset link. Please verify again.' });
  }
});

const USER_SAFE_FIELDS = 'user_id, first_name, middle_name, last_name, email, phone_number, address, account_status, date_registered';

// PATCH /api/auth/profile — logged-in user updates own account
router.patch('/profile', authenticateToken, async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(401).json({ message: 'Access denied.' });
  }

  const { first_name, middle_name, last_name, email, phone_number, address, password, current_password } = req.body;
  const updates = {};

  if (first_name !== undefined) updates.first_name = String(first_name).trim();
  if (middle_name !== undefined) updates.middle_name = String(middle_name).trim() || null;
  if (last_name !== undefined) updates.last_name = String(last_name).trim();
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    updates.email = normalizedEmail;
  }
  if (phone_number !== undefined) updates.phone_number = String(phone_number).trim() || null;
  if (address !== undefined) updates.address = String(address).trim() || null;

  if (password) {
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    if (!current_password) {
      return res.status(400).json({ message: 'Current password is required to set a new password.' });
    }
    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('password')
      .eq('user_id', user_id)
      .single();
    if (existingError || !existing) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const matches = await bcrypt.compare(String(current_password), existing.password);
    if (!matches) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    updates.password = await bcrypt.hash(String(password), 10);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', user_id)
      .select(USER_SAFE_FIELDS)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Email or phone number already in use.' });
      }
      return res.status(500).json({ message: error.message });
    }
    if (!data) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'Profile updated.', user: data });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auth/users  - Get all users (for dashboard)
router.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, first_name, middle_name, last_name, email, phone_number, address, account_status, date_registered')
      .order('date_registered', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    const rows = (data || []).map((u) => ({
      ...u,
      block_reason: u.account_status === 'Blocked' ? getUserBlockReason(u.user_id) : null,
    }));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

const USER_STATUSES = ['Active', 'Inactive', 'Blocked', 'Deleted'];

// PATCH /api/auth/users/:id — edit profile or block/unblock
router.patch('/users/:id', async (req, res) => {
  const { first_name, middle_name, last_name, email, phone_number, address, account_status, password, block_reason } = req.body;
  const updates = {};

  if (first_name !== undefined) updates.first_name = first_name.trim();
  if (middle_name !== undefined) updates.middle_name = middle_name.trim() || null;
  if (last_name !== undefined) updates.last_name = last_name.trim();
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    updates.email = email.trim();
  }
  if (phone_number !== undefined) updates.phone_number = phone_number.trim() || null;
  if (address !== undefined) updates.address = address.trim() || null;
  if (account_status !== undefined) {
    if (!USER_STATUSES.includes(account_status)) {
      return res.status(400).json({ message: 'Invalid status. Use Active, Inactive, Blocked, or Deleted.' });
    }
    updates.account_status = account_status;
  }
  if (account_status === 'Blocked') {
    const validReason = BLOCK_REASONS.some((r) => r.id === block_reason);
    setUserBlockReason(req.params.id, validReason ? block_reason : 'admin');
  }
  if (account_status === 'Active' || account_status === 'Deleted') {
    setUserBlockReason(req.params.id, null);
  }
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    updates.password = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', req.params.id)
      .select(USER_SAFE_FIELDS)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Email or phone number already in use.' });
      }
      return res.status(500).json({ message: error.message });
    }
    if (!data) return res.status(404).json({ message: 'User not found.' });
    return res.json({
      ...data,
      block_reason: data.account_status === 'Blocked' ? getUserBlockReason(data.user_id) : null,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('user_id', req.params.id);

    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({
          message: 'This user has incident records. Block the account instead of deleting.',
        });
      }
      return res.status(500).json({ message: error.message });
    }
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
