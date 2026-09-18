const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

const { listOccupiedResponders, isResponderOccupied } = require('../utils/responderBusy');
const { logActivity } = require('../utils/activityLogger');

const VALID_TEAMS = [
  'Alpha 1', 'Alpha 2', 'Alpha 3', 'Alpha 4',
  'Bravo 1', 'Bravo 2', 'Bravo 3',
  'Charlie 1', 'Charlie 2', 'Charlie 3',
];
const VALID_STATUSES = ['Available', 'Busy', 'Off Duty'];

// GET /api/responders
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('responders')
      .select('responder_id, vehicle, team, contact_number, availability_status')
      .order('responder_id', { ascending: true });

    if (error) return res.status(500).json({ message: error.message });
    const occupied = await listOccupiedResponders();
    const rows = (data || []).map((row) => {
      const busyOn = occupied.get(Number(row.responder_id));
      return {
        ...row,
        // Always show the status saved in Edit Vehicle (Available / Busy / Off Duty)
        availability_status: row.availability_status || 'Available',
        occupied: Boolean(busyOn),
        occupied_incident_id: busyOn || null,
      };
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/responders
router.post('/', async (req, res) => {
  const vehicle = String(req.body.vehicle || '').trim();
  const team = String(req.body.team || '').trim();
  const contact_number = req.body.contact_number;
  const availability_status = req.body.availability_status || 'Available';

  if (!vehicle || !team) {
    return res.status(400).json({ message: 'Vehicle and team are required.' });
  }
  if (!VALID_TEAMS.includes(team)) {
    return res.status(400).json({ message: 'Invalid team. Choose Alpha, Bravo, or Charlie unit.' });
  }
  if (!VALID_STATUSES.includes(availability_status)) {
    return res.status(400).json({ message: 'Invalid availability status.' });
  }

  try {
    const { data, error } = await supabase
      .from('responders')
      .insert([{
        vehicle,
        team,
        contact_number: contact_number || null,
        availability_status,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    logActivity(req, {
      action: 'responder.create',
      entity_type: 'responder',
      entity_id: data.responder_id,
      target: data.vehicle,
      details: `Added vehicle ${data.vehicle} (${data.team}).`,
    });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/responders/:id
router.patch('/:id', async (req, res) => {
  const responderId = Number(req.params.id);
  if (!Number.isFinite(responderId)) {
    return res.status(400).json({ message: 'Invalid responder id.' });
  }

  const updates = {};
  if (req.body.vehicle !== undefined) {
    const vehicle = String(req.body.vehicle || '').trim();
    if (!vehicle) return res.status(400).json({ message: 'Vehicle name is required.' });
    updates.vehicle = vehicle;
  }
  if (req.body.team !== undefined) {
    const team = String(req.body.team || '').trim();
    if (!VALID_TEAMS.includes(team)) {
      return res.status(400).json({ message: 'Invalid team. Choose Alpha, Bravo, or Charlie unit.' });
    }
    updates.team = team;
  }
  if (req.body.contact_number !== undefined) {
    updates.contact_number = req.body.contact_number || null;
  }
  if (req.body.availability_status !== undefined) {
    if (!VALID_STATUSES.includes(req.body.availability_status)) {
      return res.status(400).json({ message: 'Invalid availability status.' });
    }
    updates.availability_status = req.body.availability_status;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    const { data, error } = await supabase
      .from('responders')
      .update(updates)
      .eq('responder_id', responderId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!data) return res.status(404).json({ message: 'Responder not found.' });
    logActivity(req, {
      action: 'responder.update',
      entity_type: 'responder',
      entity_id: data.responder_id,
      target: data.vehicle,
      details: `Updated vehicle ${data.vehicle} (${data.team})${updates.availability_status ? ` (status: ${updates.availability_status})` : ''}.`,
    });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/responders/:id/status
router.patch('/:id/status', async (req, res) => {
  const responderId = Number(req.params.id);
  const { availability_status } = req.body;
  if (!availability_status) {
    return res.status(400).json({ message: 'availability_status is required.' });
  }
  if (!VALID_STATUSES.includes(availability_status)) {
    return res.status(400).json({ message: 'Invalid availability status.' });
  }

  try {
    const { data, error } = await supabase
      .from('responders')
      .update({ availability_status })
      .eq('responder_id', responderId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!data) return res.status(404).json({ message: 'Responder not found.' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/responders/:id
router.delete('/:id', async (req, res) => {
  const responderId = Number(req.params.id);
  if (!Number.isFinite(responderId)) {
    return res.status(400).json({ message: 'Invalid responder id.' });
  }

  try {
    const occupied = await isResponderOccupied(responderId);
    if (occupied) {
      return res.status(400).json({
        message: 'Cannot delete — this unit is assigned to an active incident.',
      });
    }

    await supabase.from('dispatch').delete().eq('responder_id', responderId);

    const { data: existing, error: findErr } = await supabase
      .from('responders')
      .select('responder_id, vehicle, team')
      .eq('responder_id', responderId)
      .maybeSingle();

    if (findErr) return res.status(500).json({ message: findErr.message });
    if (!existing) return res.status(404).json({ message: 'Responder not found.' });

    const { error } = await supabase
      .from('responders')
      .delete()
      .eq('responder_id', responderId);

    if (error) return res.status(500).json({ message: error.message });

    logActivity(req, {
      action: 'responder.delete',
      entity_type: 'responder',
      entity_id: responderId,
      target: existing.vehicle,
      details: `Deleted vehicle ${existing.vehicle} (${existing.team}).`,
    });
    return res.json({ message: 'Responder deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
module.exports.VALID_TEAMS = VALID_TEAMS;
