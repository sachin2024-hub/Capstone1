import api from './api';

export const INCIDENT_STATUSES = [
  { value: 'Pending', label: 'Pending', hint: 'Waiting for dispatch' },
  { value: 'In Progress', label: 'In Progress', hint: 'Dispatched — preparing response' },
  { value: 'En Route', label: 'En Route', hint: 'Ambulance/responders are on the way' },
  { value: 'Arrived', label: 'Arrived', hint: 'Responders arrived at scene' },
  { value: 'Resolved', label: 'Resolved', hint: 'Emergency resolved' },
  { value: 'Cancelled', label: 'Cancelled', hint: 'Incident cancelled' },
  { value: 'Archived', label: 'Archived', hint: 'Moved to archive' },
];

export async function updateIncidentStatus(incidentId, incident_status) {
  const res = await api.patch(`/incidents/${incidentId}/status`, { incident_status });
  return res.data;
}

export async function archiveIncident(incidentId) {
  const res = await api.patch(`/incidents/${incidentId}/archive`);
  return res.data;
}

export async function deleteIncident(incidentId) {
  const res = await api.delete(`/incidents/${incidentId}`);
  return res.data;
}

export async function permanentDeleteIncident(incidentId) {
  const res = await api.delete(`/incidents/${incidentId}/permanent`);
  return res.data;
}
