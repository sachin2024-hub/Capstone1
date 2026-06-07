const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticateToken = require('../middleware/auth');
const { autoDispatch } = require('../utils/autoDispatch');
const { isWithinCabadbaran } = require('../config/cabadbaran');

// POST /api/incidents/sos  - Send SOS emergency alert
router.post('/sos', authenticateToken, async (req, res) => {
  const { incident_type, incident_description, latitude, longitude, location_address } = req.body;
  const user_id = req.user.user_id;

  if (!latitude || !longitude) {
    return res.status(400).json({ message: 'Location is required. Please enable GPS.' });
  }

  if (!isWithinCabadbaran(Number(latitude), Number(longitude))) {
    return res.status(403).json({
      message: 'Naka-lapas na sa Cabadbaran City. Ang SOS available lang sulod sa city.',
    });
  }

  try {
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert([
        {
          user_id,
          incident_type: incident_type || 'Emergency',
          incident_description: incident_description || 'SOS alert triggered.',
          incident_status: 'Pending',
          priority_level: 'High',
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
            location_address: location_address || null,
          },
        ]);

      if (locationError) {
        console.error('Location insert error:', locationError.message);
      }
    }

    const dispatch = await autoDispatch(incident.incident_id);

    return res.status(201).json({
      message: 'SOS sent successfully! Help is on the way.',
      incident,
      dispatch,
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

const VALID_STATUSES = ['Pending', 'In Progress', 'En Route', 'Arrived', 'Resolved', 'Cancelled'];

const DISPATCH_STATUS_MAP = {
  Pending: 'Assigned',
  'In Progress': 'En Route',
  'En Route': 'En Route',
  Arrived: 'Arrived',
  Resolved: 'Completed',
  Cancelled: 'Completed',
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

module.exports = router;
