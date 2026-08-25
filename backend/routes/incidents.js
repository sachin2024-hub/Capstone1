const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticateToken = require('../middleware/auth');
const { autoDispatch } = require('../utils/autoDispatch');
const { isWithinCabadbaran } = require('../config/cabadbaran');
const { buildLocationAddress } = require('../utils/locationFormat');
const { resolveLocationFromGps } = require('../utils/locationResolver');
const { rememberStatus, takeSavedStatus, SAVED_STATUSES } = require('../utils/restoreStatus');
const { listViewedIncidents, markIncidentViewed, clearIncidentViewed } = require('../utils/archiveStore');

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
    const payload = {
      user_id,
      incident_type: incident_type || 'Emergency',
      incident_description: withinCity
        ? baseDescription
        : `${baseDescription} ${OUTSIDE_MESSAGE}`,
      incident_status: withinCity ? 'Pending' : 'Outside',
      priority_level: resolvedPriority,
    };

    let { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert([payload])
      .select()
      .single();

    if (incidentError && !withinCity) {
      const retry = await supabase
        .from('incidents')
        .insert([{ ...payload, incident_status: 'Pending' }])
        .select()
        .single();
      incident = retry.data;
      incidentError = retry.error;
    }

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

    const dispatch = withinCity ? await autoDispatch(incident.incident_id) : null;

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
        dispatch(dispatch_id, responder_id, dispatch_status, dispatch_time, responders(responder_id, first_name, last_name, responder_type))
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

const CLOSED_FOR_CANCEL = ['Resolved', 'Cancelled', 'Archived', 'Completed', 'Deleted'];

function withCancelReason(description, reason) {
  const base = String(description || '').replace(/\n?\[Cancelled by reporter\][\s\S]*$/i, '').trim();
  const note = `[Cancelled by reporter] ${reason}`;
  return base ? `${base}\n${note}` : note;
}

async function cancelOwnedIncident(req, res, incidentId, reason) {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(401).json({ message: 'Access denied.' });
  }
  if (!reason) {
    return res.status(400).json({ message: 'Please provide a reason for cancelling this request.' });
  }
  if (reason.length > 300) {
    return res.status(400).json({ message: 'Cancel reason must be 300 characters or less.' });
  }

  try {
    const { data: existing, error: existingErr } = await supabase
      .from('incidents')
      .select('incident_id, user_id, incident_status, incident_description')
      .eq('incident_id', incidentId)
      .single();

    if (existingErr || !existing) {
      return res.status(404).json({ message: 'Incident not found.' });
    }
    if (String(existing.user_id) !== String(user_id)) {
      return res.status(403).json({ message: 'You can only cancel your own requests.' });
    }
    if (CLOSED_FOR_CANCEL.includes(existing.incident_status)) {
      return res.status(400).json({ message: 'This request can no longer be cancelled.' });
    }

    const { data: incident, error: incErr } = await supabase
      .from('incidents')
      .update({
        incident_status: 'Cancelled',
        incident_description: withCancelReason(existing.incident_description, reason),
      })
      .eq('incident_id', incidentId)
      .select()
      .single();

    if (incErr) return res.status(500).json({ message: incErr.message });

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

      if (dispatch.responder_id) {
        await supabase
          .from('responders')
          .update({ availability_status: 'Available' })
          .eq('responder_id', dispatch.responder_id);
      }
    }

    return res.json({
      message: 'Request cancelled.',
      incident,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/incidents/cancel — reporter cancels their own request
router.post('/cancel', authenticateToken, async (req, res) => {
  const incidentId = Number(req.body?.incident_id || req.body?.id);
  const reason = String(req.body?.reason || '').trim();
  if (!incidentId) {
    return res.status(400).json({ message: 'Incident ID is required.' });
  }
  return cancelOwnedIncident(req, res, incidentId, reason);
});

// GET /api/incidents/all  - Get all incidents (for dashboard)
router.get('/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select(`
        *,
        users(user_id, first_name, last_name, email, phone_number),
        locations(*),
        dispatch(dispatch_id, responder_id, dispatch_status, dispatch_time, responders(responder_id, first_name, last_name, responder_type))
      `)
      .order('date_reported', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    const userIds = [...new Set((data || []).map((inc) => inc.user_id).filter(Boolean))];
    let registeredById = {};
    if (userIds.length) {
      const { data: userRows } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, email, phone_number')
        .in('user_id', userIds);
      registeredById = Object.fromEntries((userRows || []).map((u) => [String(u.user_id), u]));
    }

    const viewedMap = listViewedIncidents();
    const rows = (data || []).map((inc) => {
      const nested = Array.isArray(inc.users) ? inc.users[0] : inc.users;
      const registered = registeredById[String(inc.user_id)] || nested || null;
      return {
        ...inc,
        users: registered,
        viewed: Boolean(viewedMap[String(inc.incident_id)]),
      };
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/incidents/:id/viewed — admin opened this request
router.patch('/:id/viewed', async (req, res) => {
  try {
    markIncidentViewed(req.params.id);
    return res.json({ incident_id: Number(req.params.id) || req.params.id, viewed: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

const CITY_FLOW = ['Pending', 'In Progress', 'En Route', 'Arrived', 'Resolved', 'Cancelled', 'Archived', 'Deleted'];
const OUTSIDE_FLOW = ['Outside', 'For Referral', 'Referred', 'Completed', 'Archived', 'Deleted'];
const VALID_STATUSES = [...new Set([...CITY_FLOW, ...OUTSIDE_FLOW])];

function canMoveStatus(from, to) {
  if (from === to) return true;
  if (from === 'Pending' && ['Outside', 'For Referral', 'Referred', 'Completed'].includes(to)) {
    return true;
  }
  const flow = OUTSIDE_FLOW.includes(from) ? OUTSIDE_FLOW : CITY_FLOW;
  const currentIdx = flow.indexOf(from);
  const nextIdx = flow.indexOf(to);
  if (currentIdx < 0 || nextIdx < 0) return false;
  return nextIdx >= currentIdx;
}

const DISPATCH_STATUS_MAP = {
  Pending: 'Assigned',
  Outside: 'Assigned',
  'For Referral': 'Assigned',
  Referred: 'Assigned',
  Completed: 'Completed',
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
      .select('incident_status, incident_description')
      .eq('incident_id', incidentId)
      .single();

    if (existingErr || !existing) {
      return res.status(404).json({ message: 'Incident not found.' });
    }

    if (!canMoveStatus(existing.incident_status, incident_status)) {
      return res.status(400).json({
        message: `Cannot change status back to ${incident_status}. Status can only move forward.`,
      });
    }

    const updates = { incident_status };
    const cancelReason = String(req.body?.reason || req.body?.cancel_reason || '').trim();
    if (incident_status === 'Cancelled' && cancelReason) {
      updates.incident_description = withCancelReason(existing.incident_description, cancelReason);
    }

    const { data: incident, error: incErr } = await supabase
      .from('incidents')
      .update(updates)
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

      if (incident_status === 'Resolved' || incident_status === 'Cancelled' || incident_status === 'Completed') {
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

// PATCH /api/incidents/:id/cancel — same as POST /cancel
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  const incidentId = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  return cancelOwnedIncident(req, res, incidentId, reason);
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

    clearIncidentViewed(incidentId);
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
