const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticateToken = require('../middleware/auth');
const { autoDispatch } = require('../utils/autoDispatch');
const { isWithinCabadbaran } = require('../config/cabadbaran');
const { buildLocationAddress } = require('../utils/locationFormat');
const { resolveLocationFromGps } = require('../utils/locationResolver');
const { rememberStatus, takeSavedStatus, SAVED_STATUSES } = require('../utils/restoreStatus');

// POST /api/incidents/sos  - Send SOS emergency alert
router.post('/sos', authenticateToken, async (req, res) => {
  const {
    incident_type,
    incident_description,
    latitude,
    longitude,
    location_address,
    purok,
    barangay,
    city,
    priority_level,
  } = req.body;

  const VALID_PRIORITIES = ['Normal', 'High', 'Critical'];
  const resolvedPriority = VALID_PRIORITIES.includes(priority_level) ? priority_level : 'High';
  const user_id = req.user.user_id;

  if (!latitude || !longitude) {
    return res.status(400).json({ message: 'Location is required. Please enable GPS.' });
  }

  const withinCity = isWithinCabadbaran(Number(latitude), Number(longitude));
  const OUTSIDE_MESSAGE =
    'Outside the service boundary. Please wait while we refer you to the nearest ambulance.';

  try {
    const resolvedLocation = await resolveLocationFromGps(
      Number(latitude),
      Number(longitude)
    );

    const baseDescription = incident_description || 'SOS alert triggered.';
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert([
        {
          user_id,
          incident_type: incident_type || 'Emergency',
          incident_description: withinCity
            ? baseDescription
            : `${baseDescription} ${OUTSIDE_MESSAGE}`,
          incident_status: 'Pending',
          priority_level: resolvedPriority,
        },
      ])
      .select()
      .single();

    if (incidentError) {
      return res.status(500).json({ message: incidentError.message });
    }

    if (latitude && longitude) {
      const { error: locationError } = await supabase
        .from('locations')
        .insert([
          {
            incident_id: incident.incident_id,
            latitude,
            longitude,
            location_address: buildLocationAddress({
              purok: resolvedLocation.purok,
              area: resolvedLocation.area,
              barangay: resolvedLocation.barangay,
              city: resolvedLocation.city,
              location_address,
            }),
          },
        ]);

      if (locationError) {
        console.error('Location insert error:', locationError.message);
      }
    }

    const dispatch = await autoDispatch(incident.incident_id);

    return res.status(201).json({
      message: withinCity
        ? 'SOS sent successfully! Help is on the way.'
        : OUTSIDE_MESSAGE,
      outside_boundary: !withinCity,
      incident,
      dispatch,
      location: resolvedLocation,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/incidents/my-incidents  - Get logged-in user's incidents
router.get('/my-incidents', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const { data, error } = await supabase
      .from('incidents')
      .select(`
        *,
        locations(*),
        dispatch(dispatch_id, dispatch_status, dispatch_time, responders(first_name, last_name, responder_type))
      `)
      .eq('user_id', user_id)
      .order('date_reported', { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/incidents/all  - Get all incidents (for dashboard)
router.get('/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select(`
        *,
        users(first_name, last_name, email),
        locations(*),
        dispatch(dispatch_id, dispatch_status, dispatch_time, responders(first_name, last_name, responder_type))
      `)
      .order('date_reported', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

const VALID_STATUSES = ['Pending', 'In Progress', 'En Route', 'Arrived', 'Resolved', 'Cancelled', 'Archived', 'Deleted'];

const DISPATCH_STATUS_MAP = {
  Pending: 'Assigned',
  'In Progress': 'En Route',
  'En Route': 'En Route',
  Arrived: 'Arrived',
  Resolved: 'Completed',
  Cancelled: 'Completed',
  Archived: 'Completed',
  Deleted: 'Completed',
};

// PATCH /api/incidents/:id/status — admin updates status (user sees on mobile)
router.patch('/:id/status', async (req, res) => {
  const { incident_status } = req.body;
  const incidentId = Number(req.params.id);

  if (!incident_status || !VALID_STATUSES.includes(incident_status)) {
    return res.status(400).json({
      message: `Invalid status. Use: ${VALID_STATUSES.join(', ')}`,
    });
  }

  try {
    const { data: existing, error: existingErr } = await supabase
      .from('incidents')
      .select('incident_status')
      .eq('incident_id', incidentId)
      .single();

    if (existingErr || !existing) {
      return res.status(404).json({ message: 'Incident not found.' });
    }

    const currentIdx = VALID_STATUSES.indexOf(existing.incident_status);
    const nextIdx = VALID_STATUSES.indexOf(incident_status);
    if (currentIdx >= 0 && nextIdx >= 0 && nextIdx < currentIdx) {
      return res.status(400).json({
        message: `Cannot change status back to ${incident_status}. Status can only move forward.`,
      });
    }

    const { data: incident, error: incErr } = await supabase
      .from('incidents')
      .update({ incident_status })
      .eq('incident_id', incidentId)
      .select()
      .single();

    if (incErr) return res.status(500).json({ message: incErr.message });
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });

    const { data: dispatches } = await supabase
      .from('dispatch')
      .select('dispatch_id, responder_id')
      .eq('incident_id', incidentId)
      .order('dispatch_time', { ascending: false })
      .limit(1);

    const dispatch = dispatches?.[0];
    if (dispatch) {
      const dispatchStatus = DISPATCH_STATUS_MAP[incident_status] || 'Assigned';
      const dispatchUpdate = { dispatch_status: dispatchStatus };
      if (incident_status === 'Arrived') {
        dispatchUpdate.arrival_time = new Date().toISOString();
      }

      await supabase
        .from('dispatch')
        .update(dispatchUpdate)
        .eq('dispatch_id', dispatch.dispatch_id);

      if (incident_status === 'Resolved' || incident_status === 'Cancelled') {
        await supabase
          .from('responders')
          .update({ availability_status: 'Available' })
          .eq('responder_id', dispatch.responder_id);
      } else if (['In Progress', 'En Route', 'Arrived'].includes(incident_status)) {
        await supabase
          .from('responders')
          .update({ availability_status: 'Busy' })
          .eq('responder_id', dispatch.responder_id);
      }
    }

    return res.json({
      message: 'Status updated successfully.',
      incident,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/incidents/:id/archive — move incident to archive
router.patch('/:id/archive', async (req, res) => {
  const incidentId = Number(req.params.id);

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('incidents')
      .select('incident_status')
      .eq('incident_id', incidentId)
      .single();

    if (fetchErr) return res.status(500).json({ message: fetchErr.message });
    if (!existing) return res.status(404).json({ message: 'Incident not found.' });

    if (!['Resolved', 'Cancelled'].includes(existing.incident_status)) {
      return res.status(400).json({
        message: 'Only resolved or cancelled incidents can be archived.',
      });
    }

    rememberStatus(incidentId, existing.incident_status);

    const { data: incident, error } = await supabase
      .from('incidents')
      .update({ incident_status: 'Archived' })
      .eq('incident_id', incidentId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });

    const { data: dispatches } = await supabase
      .from('dispatch')
      .select('dispatch_id, responder_id')
      .eq('incident_id', incidentId)
      .order('dispatch_time', { ascending: false })
      .limit(1);

    const dispatch = dispatches?.[0];
    if (dispatch) {
      await supabase
        .from('dispatch')
        .update({ dispatch_status: 'Completed' })
        .eq('dispatch_id', dispatch.dispatch_id);

      await supabase
        .from('responders')
        .update({ availability_status: 'Available' })
        .eq('responder_id', dispatch.responder_id);
    }

    return res.json({ message: 'Incident archived.', incident });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/incidents/:id/restore — Archived or Deleted → Resolved immediately
router.patch('/:id/restore', async (req, res) => {
  const incidentId = Number(req.params.id);

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('incidents')
      .select('incident_id, incident_status')
      .eq('incident_id', incidentId)
      .single();

    if (fetchErr) return res.status(500).json({ message: fetchErr.message });
    if (!existing) return res.status(404).json({ message: 'Incident not found.' });

    if (!['Archived', 'Deleted'].includes(existing.incident_status)) {
      return res.status(400).json({
        message: 'Only archived or deleted incidents can be restored.',
      });
    }

    const fromBody = req.body?.previous_status;
    const fromFile = takeSavedStatus(incidentId);
    const saved = SAVED_STATUSES.includes(fromBody) ? fromBody : fromFile;
    const nextStatus = SAVED_STATUSES.includes(saved)
      ? saved
      : (existing.incident_status === 'Archived' ? 'Resolved' : 'Pending');

    const { data: incident, error } = await supabase
      .from('incidents')
      .update({ incident_status: nextStatus })
      .eq('incident_id', incidentId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: `Incident restored to ${nextStatus}.`, incident });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

async function freeRespondersForIncident(incidentId) {
  const { data: dispatches } = await supabase
    .from('dispatch')
    .select('dispatch_id, responder_id')
    .eq('incident_id', incidentId);

  if (!dispatches?.length) return;

  for (const d of dispatches) {
    await supabase
      .from('responders')
      .update({ availability_status: 'Available' })
      .eq('responder_id', d.responder_id);

    await supabase
      .from('dispatch')
      .update({ dispatch_status: 'Completed' })
      .eq('dispatch_id', d.dispatch_id);
  }
}

// DELETE /api/incidents/:id/permanent — permanently remove (Deleted status only)
router.delete('/:id/permanent', async (req, res) => {
  const incidentId = Number(req.params.id);

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('incidents')
      .select('incident_status')
      .eq('incident_id', incidentId)
      .single();

    if (fetchErr) return res.status(500).json({ message: fetchErr.message });
    if (!existing) return res.status(404).json({ message: 'Incident not found.' });

    if (existing.incident_status !== 'Deleted') {
      return res.status(400).json({
        message: 'Only deleted incidents can be permanently removed.',
      });
    }

    await supabase.from('dispatch').delete().eq('incident_id', incidentId);
    await supabase.from('locations').delete().eq('incident_id', incidentId);

    const { error } = await supabase
      .from('incidents')
      .delete()
      .eq('incident_id', incidentId);

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: 'Incident permanently removed.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/incidents/:id — soft delete (moves to Archive → Deleted)
router.delete('/:id', async (req, res) => {
  const incidentId = Number(req.params.id);

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('incidents')
      .select('incident_id, incident_status')
      .eq('incident_id', incidentId)
      .single();

    if (fetchErr) return res.status(500).json({ message: fetchErr.message });
    if (!existing) return res.status(404).json({ message: 'Incident not found.' });

    if (existing.incident_status === 'Deleted') {
      return res.status(400).json({ message: 'Incident is already in Deleted.' });
    }

    await freeRespondersForIncident(incidentId);

    rememberStatus(incidentId, req.body?.previous_status || existing.incident_status);

    const { data: incident, error } = await supabase
      .from('incidents')
      .update({ incident_status: 'Deleted' })
      .eq('incident_id', incidentId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: 'Incident moved to Deleted.', incident });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
