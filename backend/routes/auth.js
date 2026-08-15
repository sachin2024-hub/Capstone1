const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

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

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          first_name,
          middle_name: middle_name || null,
          last_name,
          phone_number: phone_number || null,
          email,
          password: hashedPassword,
          address: address || null,
          account_status: 'Active',
        },
      ])
      .select('user_id, first_name, middle_name, last_name, email, phone_number, address, account_status')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Email or phone number already registered.' });
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

// GET /api/auth/users  - Get all users (for dashboard)
router.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, first_name, middle_name, last_name, email, phone_number, address, account_status, date_registered')
      .order('date_registered', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
