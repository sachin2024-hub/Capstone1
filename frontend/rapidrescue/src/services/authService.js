import api from './api';

export const register = async (data) => {
  const res = await api.post('/admin/register', data);
  localStorage.setItem('rr_token', res.data.token);
  localStorage.setItem('rr_admin', JSON.stringify(res.data.admin));
  return res.data;
};

export const login = async (data) => {
  const res = await api.post('/admin/login', data);
  localStorage.setItem('rr_token', res.data.token);
  localStorage.setItem('rr_admin', JSON.stringify(res.data.admin));
  return res.data;
};

export const logout = () => {
  localStorage.removeItem('rr_token');
  localStorage.removeItem('rr_admin');
};

export const getStoredAdmin = () => {
  const raw = localStorage.getItem('rr_admin');
  return raw ? JSON.parse(raw) : null;
};

export const isAuthenticated = () => !!localStorage.getItem('rr_token');
