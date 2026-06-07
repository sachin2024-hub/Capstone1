import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rr_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) {
      return Promise.reject(new Error(err.response.data?.message || 'Something went wrong.'));
    }
    if (err.request) {
      return Promise.reject(new Error('Cannot connect to server. Make sure the backend is running.'));
    }
    return Promise.reject(err);
  }
);

export default api;
