const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { CABADBARAN, RESPONDER_STATIONS, isWithinCabadbaran, CITY_HALL } = require('../config/cabadbaran');
const { parseLocationAddress } = require('../utils/locationFormat');

// GET /api/dispatch/all
router.get('/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dispatch')
      .select(`
        *,
        incidents(incident_id, incident_type, incident_status, priority_level, date_reported, users(first_name, last_name)),
        responders(responder_id, first_name, last_name, responder_type, contact_number, availability_status)
      `)
      .order('dispatch_time', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/dispatch/live — active SOS incidents with map data + routes
router.get('/live', async (req, res) => {
  try {
    const { data: incidents, error: incErr } = await supabase
      .from('incidents')
      .select(`
        *,
        users(first_name, last_name, phone_number, email),
        locations(*),
        dispatch(
          dispatch_id, dispatch_status, dispatch_time,
          responders(responder_id, first_name, last_name, responder_type, contact_number, availability_status)
        )
      `)
      .in('incident_status', ['Pending', 'In Progress'])
      .order('date_reported', { ascending: false });

    if (incErr) return res.status(500).json({ message: incErr.message });

    const live = (incidents || [])
      .filter((inc) => inc.locations && (Array.isArray(inc.locations) ? inc.locations.length : inc.locations))
      .map((inc) => {
        const loc = Array.isArray(inc.locations) ? inc.locations[0] : inc.locations;
        const dispatch = Array.isArray(inc.dispatch) ? inc.dispatch[0] : inc.dispatch;
        const responder = dispatch?.responders;
        const locDetails = parseLocationAddress(loc.location_address);
        const victim = {
          lat: Number(loc.latitude),
          lng: Number(loc.longitude),
          address: locDetails.display,
          purok: locDetails.purok,
          area: locDetails.area,
          barangay: locDetails.barangay,
          city: locDetails.city,
        };
        // Always dispatch from CDRRMO HQ (Brgy. 9, Cabadbaran City)
        const responderPos = {
          lat: CITY_HALL.lat,
          lng: CITY_HALL.lng,
          station_name: 'CDRRMO — Brgy. 9, Cabadbaran City',
        };
        const withinCity = isWithinCabadbaran(victim.lat, victim.lng);
        return {
          incident_id: inc.incident_id,
          within_city: withinCity,
          incident_type: inc.incident_type,
          incident_status: inc.incident_status,
          priority_level: inc.priority_level,
          date_reported: inc.date_reported,
          user: inc.users,
          victim,
          dispatch: dispatch ? {
            dispatch_id: dispatch.dispatch_id,
            dispatch_status: dispatch.dispatch_status,
            dispatch_time: dispatch.dispatch_time,
          } : null,
          responder: responder ? {
            ...responder,
            latitude: responderPos.lat,
            longitude: responderPos.lng,
            station_name: responderPos.station_name,
          } : null,
        };
      });

    return res.json(live);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/dispatch/:id/status
router.patch('/:id/status', async (req, res) => {
  const { dispatch_status, incident_status } = req.body;

  try {
    const { data: dispatch, error } = await supabase
      .from('dispatch')
      .update({ dispatch_status: dispatch_status || undefined })
      .eq('dispatch_id', req.params.id)
      .select('incident_id')
      .single();

    if (error) return res.status(500).json({ message: error.message });

    if (incident_status && dispatch?.incident_id) {
      await supabase
        .from('incidents')
        .update({ incident_status })
        .eq('incident_id', dispatch.incident_id);
    }

    return res.json({ message: 'Updated successfully.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
