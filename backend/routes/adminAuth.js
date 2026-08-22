const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const {
  isAdminBlocked,
  setAdminBlocked,
  isAdminArchived,
  setAdminArchived,
  getAdminBlockReason,
  setAdminBlockReason,
} = require('../utils/archiveStore');
const { BLOCK_REASONS, blockedAccountMessage } = require('../utils/blockReasons');

const ADMIN_ROLES = ['Admin', 'User'];

// POST /api/admin/register
router.post('/register', async (req, res) => {
  const { first_name, middle_name, last_name, username, password, role, contact_number } = req.body;

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
        },
      ])
      .select('admin_id, first_name, middle_name, last_name, username, role, contact_number')
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
      .select('admin_id, first_name, middle_name, last_name, username, role, contact_number')
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

    return res.json({
      message: 'Login successful!',
      admin: adminWithoutPassword,
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

const ADMIN_SAFE_FIELDS = 'admin_id, first_name, middle_name, last_name, username, role, contact_number';

// PATCH /api/admin/:id — edit admin (must stay after /list, /register, /login)
router.patch('/:id', async (req, res) => {
  const { first_name, middle_name, last_name, username, role, contact_number, password, account_status, block_reason } = req.body;
  const updates = {};

  if (first_name !== undefined) updates.first_name = first_name.trim();
  if (middle_name !== undefined) updates.middle_name = middle_name.trim() || null;
  if (last_name !== undefined) updates.last_name = last_name.trim();
  if (username !== undefined) updates.username = username.trim();
  if (contact_number !== undefined) updates.contact_number = contact_number.trim() || null;
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
          const validReason = BLOCK_REASONS.some((r) => r.id === block_reason);
          setAdminBlockReason(req.params.id, validReason ? block_reason : 'admin');
        } else {
          setAdminBlockReason(req.params.id, null);
        }
      }
    }

    const archived = isAdminArchived(req.params.id);
    const blocked = isAdminBlocked(req.params.id);
    return res.json({
      ...data,
      account_status: archived ? 'Deleted' : (blocked ? 'Blocked' : 'Active'),
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
    return res.json({ message: 'Admin deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
