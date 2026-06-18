import api from './api';

export async function assignResponder(incidentId, responderId) {
  const res = await api.post('/dispatch/assign', {
    incident_id: incidentId,
    responder_id: responderId,
  });
  return res.data;
}
