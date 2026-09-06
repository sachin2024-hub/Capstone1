const supabase = require('../config/supabase');
const { listOccupiedResponders } = require('./responderBusy');

async function autoDispatch(incidentId) {
  const occupied = await listOccupiedResponders(incidentId);
  const { data: responders, error: respErr } = await supabase
    .from('responders')
    .select('*')
    .eq('availability_status', 'Available');

  const free = (responders || []).filter((row) => !occupied.has(Number(row.responder_id)));

  if (respErr || !free.length) {
    return null;
  }

  const responder = free[0];

  const { data: dispatch, error: dispErr } = await supabase
    .from('dispatch')
    .insert([{
      incident_id: incidentId,
      responder_id: responder.responder_id,
      dispatch_status: 'En Route',
    }])
    .select(`*, responders(*)`)
    .single();

  if (dispErr) {
    console.error('Dispatch error:', dispErr.message);
    return null;
  }

  await supabase
    .from('incidents')
    .update({ incident_status: 'Dispatch' })
    .eq('incident_id', incidentId);

  await supabase
    .from('responders')
    .update({ availability_status: 'Busy' })
    .eq('responder_id', responder.responder_id);

  return dispatch;
}

module.exports = { autoDispatch };
