import React, { useEffect, useState } from 'react';
import {
    Users, Clock, CheckCircle, XCircle, Trash2, ShieldCheck,
    Loader2, RefreshCw, AlertCircle, ChevronDown
} from 'lucide-react';
import { getPendingUsers, getAllUsers, approveUser, rejectUser, deleteUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';

const ROLE_OPTIONS = ['user', 'admin'];
const PERM_OPTIONS = ['read', 'write'];

const statusColor = {
    pending: 'bg-amber-100 text-amber-700',
    active: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
};

const roleColor = {
    admin: 'bg-purple-100 text-purple-700',
    user: 'bg-blue-100 text-blue-700',
};

const permColor = {
    write: 'bg-orange-100 text-orange-700',
    read: 'bg-gray-100 text-gray-600',
};

function Badge({ text, colorMap }) {
    return (
        <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${colorMap[text] || 'bg-gray-100 text-gray-600'}`}>
            {text}
        </span>
    );
}

export default function AdminPage() {
    const { user: me } = useAuth();
    const [tab, setTab] = useState('pending');
    const [pending, setPending] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Approval form state per pending user
    const [approvalSettings, setApprovalSettings] = useState({});

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const [p, a] = await Promise.all([getPendingUsers(), getAllUsers()]);
            setPending(p);
            setAllUsers(a);
            // Init approval settings for each pending user
            const defaults = {};
            p.forEach((u) => {
                defaults[u.email] = { role: 'user', permission: 'read' };
            });
            setApprovalSettings((prev) => ({ ...defaults, ...prev }));
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const flash = (msg, isError = false) => {
        if (isError) { setError(msg); setSuccess(''); }
        else { setSuccess(msg); setError(''); }
        setTimeout(() => { setError(''); setSuccess(''); }, 4000);
    };

    const handleApprove = async (email) => {
        const { role, permission } = approvalSettings[email] || { role: 'user', permission: 'read' };
        setActionLoading(email + '-approve');
        try {
            await approveUser(email, role, permission);
            flash(`${email} approved as ${role} (${permission})`);
            fetchData();
        } catch (err) {
            flash(err.response?.data?.detail || 'Approval failed', true);
        } finally {
            setActionLoading('');
        }
    };

    const handleReject = async (email) => {
        if (!window.confirm(`Reject ${email}?`)) return;
        setActionLoading(email + '-reject');
        try {
            await rejectUser(email);
            flash(`${email} rejected`);
            fetchData();
        } catch (err) {
            flash(err.response?.data?.detail || 'Reject failed', true);
        } finally {
            setActionLoading('');
        }
    };

    const handleDelete = async (email) => {
        if (!window.confirm(`Permanently delete ${email}? This cannot be undone.`)) return;
        setActionLoading(email + '-delete');
        try {
            await deleteUser(email);
            flash(`${email} deleted`);
            fetchData();
        } catch (err) {
            flash(err.response?.data?.detail || 'Delete failed', true);
        } finally {
            setActionLoading('');
        }
    };

    const setApproval = (email, field, value) => {
        setApprovalSettings((prev) => ({
            ...prev,
            [email]: { ...(prev[email] || {}), [field]: value },
        }));
    };

    const isActing = (key) => actionLoading === key;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Manage access and permissions for all users.</p>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-all"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Flash messages */}
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={16} className="shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                    <CheckCircle size={16} className="shrink-0" /> {success}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Users', value: allUsers.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'Pending', value: pending.length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
                    { label: 'Active', value: allUsers.filter(u => u.status === 'active').length, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
                    { label: 'Rejected', value: allUsers.filter(u => u.status === 'rejected').length, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                            <s.icon size={18} className={s.color} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                            <p className="text-xs text-gray-500">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200">
                {[
                    { key: 'pending', label: `Pending Approval (${pending.length})`, icon: Clock },
                    { key: 'all', label: `All Users (${allUsers.length})`, icon: Users },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                            tab === t.key
                                ? 'border-red-500 text-red-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <t.icon size={15} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={28} className="animate-spin text-gray-400" />
                </div>
            ) : tab === 'pending' ? (
                <PendingTable
                    users={pending}
                    settings={approvalSettings}
                    setApproval={setApproval}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isActing={isActing}
                />
            ) : (
                <AllUsersTable
                    users={allUsers}
                    me={me}
                    onDelete={handleDelete}
                    isActing={isActing}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
function PendingTable({ users, settings, setApproval, onApprove, onReject, isActing }) {
    if (!users.length) return (
        <div className="text-center py-16 text-gray-400">
            <Clock size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No pending requests</p>
        </div>
    );

    return (
        <div className="space-y-3">
            {users.map((u) => {
                const cfg = settings[u.email] || { role: 'user', permission: 'read' };
                return (
                    <div key={u.email} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{u.email}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Requested: {new Date(u.created_at).toLocaleString()}
                            </p>
                        </div>

                        {/* Role selector */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <SelectInput
                                label="Role"
                                options={ROLE_OPTIONS}
                                value={cfg.role}
                                onChange={(v) => setApproval(u.email, 'role', v)}
                            />
                            <SelectInput
                                label="Permission"
                                options={PERM_OPTIONS}
                                value={cfg.permission}
                                onChange={(v) => setApproval(u.email, 'permission', v)}
                            />
                            <button
                                onClick={() => onApprove(u.email)}
                                disabled={isActing(`${u.email}-approve`)}
                                className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
                            >
                                {isActing(`${u.email}-approve`) ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                Approve
                            </button>
                            <button
                                onClick={() => onReject(u.email)}
                                disabled={isActing(`${u.email}-reject`)}
                                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 text-sm font-medium px-4 py-2 rounded-lg transition-all border border-red-200"
                            >
                                {isActing(`${u.email}-reject`) ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                                Reject
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
function AllUsersTable({ users, me, onDelete, isActing }) {
    if (!users.length) return (
        <div className="text-center py-16 text-gray-400">
            <Users size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No users found</p>
        </div>
    );

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        {['Email', 'Role', 'Permission', 'Status', 'Approved By', 'Joined', ''].map(h => (
                            <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                        <tr key={u.email} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                            <td className="px-4 py-3"><Badge text={u.role} colorMap={roleColor} /></td>
                            <td className="px-4 py-3"><Badge text={u.permission} colorMap={permColor} /></td>
                            <td className="px-4 py-3"><Badge text={u.status} colorMap={statusColor} /></td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{u.approved_by || '—'}</td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3">
                                {u.email !== me?.email && u.role !== 'admin' && (
                                    <button
                                        onClick={() => onDelete(u.email)}
                                        disabled={isActing(`${u.email}-delete`)}
                                        className="flex items-center gap-1 text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                                        title="Delete user"
                                    >
                                        {isActing(`${u.email}-delete`) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ---------------------------------------------------------------------------
function SelectInput({ label, options, value, onChange }) {
    return (
        <div className="relative flex items-center gap-1.5">
            <span className="text-xs text-gray-500 shrink-0">{label}:</span>
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="appearance-none text-sm border border-gray-200 rounded-lg px-3 py-1.5 pr-7 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 cursor-pointer"
                >
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
        </div>
    );
}
