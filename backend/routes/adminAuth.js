const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

// POST /api/admin/register
router.post('/register', async (req, res) => {
  const { first_name, middle_name, last_name, username, password, role, contact_number } = req.body;

  if (!first_name || !last_name || !username || !password) {
    return res.status(400).json({ message: 'First name, last name, username, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
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
          role: role || 'Admin',
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

module.exports = router;
