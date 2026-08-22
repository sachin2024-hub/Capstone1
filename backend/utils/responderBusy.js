const supabase = require('../config/supabase');

const OPEN_INCIDENT_STATUSES = [
  'Pending',
  'In Progress',
  'En Route',
  'Arrived',
  'Outside',
  'For Referral',
  'Referred',
];

async function listOccupiedResponders(exceptIncidentId = null) {
  const { data: openIncidents, error } = await supabase
    .from('incidents')
    .select('incident_id')
    .in('incident_status', OPEN_INCIDENT_STATUSES);

  if (error || !openIncidents?.length) return new Map();

  const openIds = openIncidents
    .map((row) => row.incident_id)
    .filter((id) => exceptIncidentId == null || Number(id) !== Number(exceptIncidentId));

  if (!openIds.length) return new Map();

  const { data: dispatches } = await supabase
    .from('dispatch')
    .select('responder_id, incident_id')
    .in('incident_id', openIds)
    .neq('dispatch_status', 'Completed');

  const occupied = new Map();
  (dispatches || []).forEach((row) => {
    if (!row.responder_id) return;
    occupied.set(Number(row.responder_id), row.incident_id);
  });
  return occupied;
}

async function isResponderOccupied(responderId, exceptIncidentId = null) {
  const occupied = await listOccupiedResponders(exceptIncidentId);
  return occupied.has(Number(responderId));
}

module.exports = { OPEN_INCIDENT_STATUSES, listOccupiedResponders, isResponderOccupied };
