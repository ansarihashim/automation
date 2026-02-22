/**
 * Auth-specific API calls.
 * Uses its own axios instance that reads the token from localStorage.
 */
import axios from 'axios';

const authApi = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
authApi.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// ── Auth ────────────────────────────────────────────────────────────────────

export const login = async (email, password) => {
    const res = await authApi.post('/auth/login', { email, password });
    return res.data; // TokenResponse | { message }
};

export const getCurrentUser = async () => {
    const res = await authApi.get('/auth/me');
    return res.data; // CurrentUser { email, role, permission }
};

// ── Admin ────────────────────────────────────────────────────────────────────

export const getPendingUsers = async () => {
    const res = await authApi.get('/admin/pending');
    return res.data;
};

export const approveUser = async (email, role, permission) => {
    const res = await authApi.post('/admin/approve', { email, role, permission });
    return res.data;
};

export const rejectUser = async (email) => {
    const res = await authApi.post('/admin/reject', { email });
    return res.data;
};

export const getAllUsers = async () => {
    const res = await authApi.get('/admin/users');
    return res.data;
};

export const deleteUser = async (email) => {
    const res = await authApi.delete(`/admin/user/${encodeURIComponent(email)}`);
    return res.data;
};
