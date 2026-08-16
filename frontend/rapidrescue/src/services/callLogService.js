import api from './api';

export const CALL_LOG_TEAMS = [
  { id: 'ALPHA', label: 'Team Alpha', hours: '0600H – 1800H', supervisor: 'CDRRMO HQ' },
  { id: 'CHARLIE', label: 'Team Charlie', hours: '0800H – 2000H', supervisor: 'RB TIEMPO' },
  { id: 'DELTA', label: 'Team Delta', hours: '2000H – 0800H', supervisor: 'J MONTE' },
];

export const TYPE_OF_CODE_OPTIONS = ['CODE 1', 'CODE 2', 'CODE 3', 'NON-EMERGENCY'];

export async function fetchCallLogs({ date, team, archived } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (team) params.set('team', team);
  if (archived) params.set('archived', '1');
  const qs = params.toString();
  const res = await api.get(`/call-logs${qs ? `?${qs}` : ''}`);
  return res.data;
}

export async function createCallLog(data) {
  const res = await api.post('/call-logs', data);
  return res.data;
}

export async function updateCallLog(id, data) {
  const res = await api.patch(`/call-logs/${id}`, data);
  return res.data;
}

export async function deleteCallLog(id) {
  const res = await api.delete(`/call-logs/${id}`);
  return res.data;
}

export async function restoreCallLog(id) {
  const res = await api.patch(`/call-logs/${id}/restore`);
  return res.data;
}

export async function permanentDeleteCallLog(id) {
  const res = await api.delete(`/call-logs/${id}`, { params: { permanent: 1 } });
  return res.data;
}
