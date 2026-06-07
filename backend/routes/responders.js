const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// GET /api/responders
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('responders')
      .select('responder_id, first_name, middle_name, last_name, contact_number, responder_type, availability_status')
      .order('responder_id', { ascending: true });

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/responders
router.post('/', async (req, res) => {
  const { first_name, middle_name, last_name, contact_number, responder_type, availability_status } = req.body;

  if (!first_name || !last_name || !responder_type) {
    return res.status(400).json({ message: 'First name, last name, and responder type are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('responders')
      .insert([{
        first_name,
        middle_name: middle_name || null,
        last_name,
        contact_number: contact_number || null,
        responder_type,
        availability_status: availability_status || 'Available',
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/responders/:id/status
router.patch('/:id/status', async (req, res) => {
  const { availability_status } = req.body;
  if (!availability_status) {
    return res.status(400).json({ message: 'availability_status is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('responders')
      .update({ availability_status })
      .eq('responder_id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
