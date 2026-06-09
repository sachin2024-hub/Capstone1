import api from './api';

export const RESPONDER_TYPES = [
  'Dispatcher',
  '1st Responder',
  'Ambulance',
  'Fire Rescue',
  'Police',
  'Rescue Team',
];

export const AVAILABILITY_STATUSES = ['Available', 'Busy', 'Off Duty'];

export async function createResponder(data) {
  const res = await api.post('/responders', data);
  return res.data;
}

export async function updateResponder(id, data) {
  const res = await api.patch(`/responders/${id}`, data);
  return res.data;
}

export async function deleteResponder(id) {
  const res = await api.delete(`/responders/${id}`);
  return res.data;
}
