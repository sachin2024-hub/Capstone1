import api from './api';

export async function fetchDispatchRecords({ date, archived } = {}) {
  const params = {};
  if (date) params.date = date;
  if (archived) params.archived = 1;
  const res = await api.get('/dispatch-records', { params });
  return res.data;
}

export async function createDispatchRecord(data) {
  const res = await api.post('/dispatch-records', data);
  return res.data;
}

export async function updateDispatchRecord(id, data) {
  const res = await api.put(`/dispatch-records/${id}`, data);
  return res.data;
}

export async function deleteDispatchRecord(id) {
  const res = await api.delete(`/dispatch-records/${id}`);
  return res.data;
}

export async function restoreDispatchRecord(id) {
  const res = await api.patch(`/dispatch-records/${id}/restore`);
  return res.data;
}

export async function permanentDeleteDispatchRecord(id) {
  const res = await api.delete(`/dispatch-records/${id}`, { params: { permanent: 1 } });
  return res.data;
}

export async function fetchDispatchLog() {
  const res = await api.get('/dispatch/all');
  return res.data;
}
