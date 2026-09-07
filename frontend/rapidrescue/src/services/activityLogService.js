import api from './api';

export async function fetchActivityLogs(params = {}) {
  const res = await api.get('/activity-logs', { params });
  return res.data;
}

export async function logAdminLogout() {
  try {
    await api.post('/activity-logs/logout');
  } catch {
    /* logout should still continue */
  }
}
