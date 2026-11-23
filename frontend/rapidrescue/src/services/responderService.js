import api from './api';

/** Ambulance team callsigns */
export const RESPONDER_TEAMS = [
  'Alpha 1',
  'Alpha 2',
  'Alpha 3',
  'Alpha 4',
  'Bravo 1',
  'Bravo 2',
  'Bravo 3',
  'Charlie 1',
  'Charlie 2',
  'Charlie 3',
];

/** @deprecated use RESPONDER_TEAMS */
export const RESPONDER_TYPES = RESPONDER_TEAMS;

export const AVAILABILITY_STATUSES = ['Available', 'Busy', 'Off Duty'];

export async function createResponder(data) {
  const res = await api.post('/responders', data);
  return res.data;
}

export async function updateResponder(id, data) {
  const res = await api.patch(`/responders/${id}`, data);
  return res.data;
}

/** Moves the vehicle to Archive (it is not erased). */
export async function deleteResponder(id) {
  const res = await api.delete(`/responders/${id}`);
  return res.data;
}

export async function restoreResponder(id) {
  const res = await api.patch(`/responders/${id}/restore`);
  return res.data;
}

export async function permanentDeleteResponder(id) {
  const res = await api.delete(`/responders/${id}`, { params: { permanent: 1 } });
  return res.data;
}

export async function fetchArchivedResponders() {
  const res = await api.get('/responders', { params: { archived: 1 } });
  return res.data;
}
