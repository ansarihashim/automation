import axios from 'axios';

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Handle 401 globally — clear token and redirect to login
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            window.location.href = '/login';
        }
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data);
        } else if (error.request) {
            console.error('Backend unreachable at', api.defaults.baseURL);
        } else {
            console.error('Request error:', error.message);
        }
        return Promise.reject(error);
    }
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const loginOrRegister = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data; // TokenResponse | {message}
};

export const getMe = async () => {
    const response = await api.get('/auth/me');
    return response.data;
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const getPendingUsers = async () => {
    const response = await api.get('/admin/pending');
    return response.data;
};

export const getAllUsers = async () => {
    const response = await api.get('/admin/users');
    return response.data;
};

export const approveUser = async (email, role, permission) => {
    const response = await api.post('/admin/approve', { email, role, permission });
    return response.data;
};

export const rejectUser = async (email) => {
    const response = await api.post('/admin/reject', { email });
    return response.data;
};

export const deleteUser = async (email) => {
    const response = await api.delete(`/admin/user/${encodeURIComponent(email)}`);
    return response.data;
};

// ---------------------------------------------------------------------------
// Admin — Client emails
// ---------------------------------------------------------------------------
export const getAdminClients = async ({ page = 1, limit = 500, search = '' } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    const response = await api.get(`/admin/clients?${params}`);
    return response.data;
};

export const upsertAdminClient = async ({ client_name, emails }) => {
    const response = await api.post('/admin/clients', { client_name, emails });
    return response.data;
};

export const deleteAdminClient = async (client_name) => {
    const response = await api.delete(`/admin/clients/${encodeURIComponent(client_name)}`);
    return response.data;
};

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
export const uploadMasterAndEmail = async (masterFile, emailFile) => {
    const formData = new FormData();
    formData.append('master_file', masterFile);
    formData.append('email_file', emailFile);
    const response = await api.post('/upload/master', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
    });
    return response.data;
};

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------
export const getBatches = async () => {
    const response = await api.get('/batches/');
    return response.data;
};

export const getRecentBatches = async () => {
    const response = await api.get('/batches/recent');
    return response.data;
};

export const getBatchById = async (batchId) => {
    const response = await api.get(`/batches/${batchId}`);
    return response.data;
};

export const getBatchClients = async (batchId) => {
    const response = await api.get(`/batches/${batchId}/clients`);
    return response.data;
};

export const downloadBatchFile = (batchId, fileType) => {
    const token = sessionStorage.getItem('token');
    const base = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`;
    window.open(`${base}/batches/${batchId}/download/${fileType}?token=${token}`, '_blank');
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
export const sendMisEmails = async (batchId, clients = null, limit = null) => {
    const payload = { batch_id: batchId };
    if (clients) payload.clients = clients;
    if (limit !== null) payload.limit = limit;
    const response = await api.post('/email/send-mis', payload);
    return response.data;
};

export const sendEmails = async (batchId, limit = null) => {
    const payload = { batch_id: batchId };
    if (limit !== null) payload.limit = limit;
    const response = await api.post('/email/send', payload);
    return response.data;
};

export const previewEmail = async (batchId, rowId) => {
    const response = await api.post('/email/preview', { batch_id: batchId, row_id: rowId });
    return response.data;
};

export const previewFirstEmail = async (batchId) => {
    const response = await api.get(`/email/preview-first/${batchId}`);
    return response.data;
};

export const getEmailLogs = async () => {
    const response = await api.get('/email/logs');
    return response.data;
};

// ---------------------------------------------------------------------------
// Files (rows)
// ---------------------------------------------------------------------------
export const getBatchRows = async (batchId, status = null) => {
    const params = {};
    if (status) params.status = status;
    const response = await api.get(`/files/${batchId}`, { params });
    return response.data;
};

export default api;
