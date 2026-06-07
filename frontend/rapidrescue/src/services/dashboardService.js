import api from './api';

export const getUsers = () => api.get('/auth/users').then((r) => r.data);
export const getIncidents = () => api.get('/incidents/all').then((r) => r.data);
