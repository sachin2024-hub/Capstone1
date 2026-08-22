const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

const { listOccupiedResponders } = require('../utils/responderBusy');

const VALID_TYPES = ['Dispatcher', '1st Responder', 'Ambulance', 'Fire Rescue', 'Police', 'Rescue Team'];
const VALID_STATUSES = ['Available', 'Busy', 'Off Duty'];

// GET /api/responders
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('responders')
      .select('responder_id, first_name, middle_name, last_name, contact_number, responder_type, availability_status')
      .order('responder_id', { ascending: true });

    if (error) return res.status(500).json({ message: error.message });
    const occupied = await listOccupiedResponders();
    const rows = (data || []).map((row) => {
      const busyOn = occupied.get(Number(row.responder_id));
      return {
        ...row,
        occupied: Boolean(busyOn),
        occupied_incident_id: busyOn || null,
        availability_status: busyOn && row.availability_status !== 'Off Duty' ? 'Busy' : row.availability_status,
      };
    });
    return res.json(rows);
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

  if (!VALID_TYPES.includes(responder_type)) {
    return res.status(400).json({ message: 'Invalid responder type.' });
  }

  const status = availability_status || 'Available';
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid availability status.' });
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
        availability_status: status,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/responders/:id — update responder
router.patch('/:id', async (req, res) => {
  const {
    first_name,
    middle_name,
    last_name,
    contact_number,
    responder_type,
    availability_status,
  } = req.body;

  const updates = {};
  if (first_name !== undefined) updates.first_name = first_name;
  if (middle_name !== undefined) updates.middle_name = middle_name || null;
  if (last_name !== undefined) updates.last_name = last_name;
  if (contact_number !== undefined) updates.contact_number = contact_number || null;
  if (responder_type !== undefined) {
    if (!VALID_TYPES.includes(responder_type)) {
      return res.status(400).json({ message: 'Invalid responder type.' });
    }
    updates.responder_type = responder_type;
  }
  if (availability_status !== undefined) {
    if (!VALID_STATUSES.includes(availability_status)) {
      return res.status(400).json({ message: 'Invalid availability status.' });
    }
    updates.availability_status = availability_status;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    const { data, error } = await supabase
      .from('responders')
      .update(updates)
      .eq('responder_id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!data) return res.status(404).json({ message: 'Responder not found.' });
    return res.json(data);
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

// DELETE /api/responders/:id
router.delete('/:id', async (req, res) => {
  const responderId = Number(req.params.id);

  try {
    const { data: activeDispatches, error: dispatchErr } = await supabase
      .from('dispatch')
      .select('dispatch_id, incidents(incident_status)')
      .eq('responder_id', responderId);

    if (dispatchErr) return res.status(500).json({ message: dispatchErr.message });

    const hasActive = (activeDispatches || []).some((d) => {
      const status = d.incidents?.incident_status;
      return status && !['Resolved', 'Cancelled', 'Archived', 'Deleted'].includes(status);
    });

    if (hasActive) {
      return res.status(400).json({
        message: 'Cannot delete — responder is assigned to an active incident.',
      });
    }

    if (activeDispatches?.length) {
      await supabase.from('dispatch').delete().eq('responder_id', responderId);
    }

    const { error } = await supabase
      .from('responders')
      .delete()
      .eq('responder_id', responderId);

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: 'Responder deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
