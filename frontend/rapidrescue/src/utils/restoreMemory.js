const KEY = 'rr_incident_prev_status';
const SAVED = ['Pending', 'Outside', 'For Referral', 'Referred', 'Completed', 'Dispatch', 'In Progress', 'En Route', 'Arrived', 'Resolved', 'Cancelled'];

function readMap() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function rememberIncidentStatus(incidentId, status) {
  if (!SAVED.includes(status)) return;
  const map = readMap();
  map[String(incidentId)] = status;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function peekIncidentStatus(incidentId) {
  const status = readMap()[String(incidentId)];
  return SAVED.includes(status) ? status : null;
}

export function takeIncidentStatus(incidentId) {
  const map = readMap();
  const key = String(incidentId);
  const status = map[key];
  delete map[key];
  localStorage.setItem(KEY, JSON.stringify(map));
  return SAVED.includes(status) ? status : null;
}
