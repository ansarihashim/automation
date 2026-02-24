import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, CheckCircle, Clock, XCircle, FileText, ExternalLink,
    Send, Users, Calendar, Database, RefreshCw, Upload, RotateCcw,
} from 'lucide-react';
import api from '../services/api';
import MISClientModal from '../components/MISClientModal';
import WriteAccess from '../components/WriteAccess';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
const StatusBadge = ({ status }) => {
    const map = {
        sent: { cls: 'bg-green-50 text-green-700 border-green-200', icon: <CheckCircle size={11} />, label: 'Sent' },
        failed: { cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle size={11} />, label: 'Failed' },
        pending: { cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: <Clock size={11} />, label: 'Pending' },
    };
    const cfg = map[status] || map.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
            {cfg.icon} {cfg.label}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
const StatCard = ({ icon, label, value, color = 'blue' }) => {
    const colorMap = {
        blue:   'bg-blue-900/40 text-blue-400',
        green:  'bg-green-900/40 text-green-400',
        yellow: 'bg-yellow-900/40 text-yellow-400',
        red:    'bg-red-900/40 text-red-400',
    };
    return (
        <div className="bg-[#1a1a1a] rounded-xl border border-gray-700 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color]}`}>
                {icon}
            </div>
            <div>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
const BatchDetailsPage = () => {
    const { batch_id } = useParams();
    const navigate = useNavigate();

    const [batch, setBatch] = useState(null);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selected, setSelected] = useState(new Set());
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [sendError, setSendError] = useState('');

    const [modalClient, setModalClient] = useState(null);

    // ── Per-client retry state ───────────────────────────────────────────────
    // Tracks which client names are currently mid-retry so we can show a spinner
    const [retrying, setRetrying] = useState(new Set());

    // ── Load data ────────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [batchRes, clientRes] = await Promise.all([
                api.get(`/batches/${batch_id}`),
                api.get(`/email/mis-preview/${batch_id}`),
            ]);
            setBatch(batchRes.data);
            const list = clientRes.data.clients || [];
            setClients(list);
            // Pre-select all non-sent clients
            setSelected(new Set(list.filter(c => c.status !== 'sent').map(c => c.client_name)));
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load batch details.');
        } finally {
            setLoading(false);
        }
    }, [batch_id]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Selection helpers ────────────────────────────────────────────────────
    const toggleClient = (name) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === clients.length) setSelected(new Set());
        else setSelected(new Set(clients.map(c => c.client_name)));
    };

    // ── Retry single failed client ────────────────────────────────────────────
    const retryClient = async (clientName) => {
        setRetrying(prev => new Set(prev).add(clientName));
        try {
            await api.post('/email/retry-client', {
                batch_id:    batch_id,
                client_name: clientName,
            });
            await loadData();
        } catch (e) {
            alert(
                e.response?.data?.detail ||
                'Retry failed. Check email configuration.'
            );
            await loadData(); // still refresh so status reflects any update
        } finally {
            setRetrying(prev => {
                const next = new Set(prev);
                next.delete(clientName);
                return next;
            });
        }
    };

    // ── Bulk send ────────────────────────────────────────────────────────────
    const handleBulkSend = async () => {
        if (selected.size === 0) return;
        setSending(true);
        setSendError('');
        setSendResult(null);
        try {
            const res = await api.post('/email/send-mis', {
                batch_id,
                clients: Array.from(selected),
                file_type: 'generated',
            });
            setSendResult(res.data);
            await loadData();
        } catch (err) {
            setSendError(err.response?.data?.detail || err.message);
        } finally {
            setSending(false);
        }
    };

    // ── Counts ───────────────────────────────────────────────────────────────
    const sentCount    = clients.filter(c => c.status === 'sent').length;
    const failedCount  = clients.filter(c => c.status === 'failed').length;
    const pendingCount = clients.filter(c => !c.status || c.status === 'pending').length;

    const formatDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    // ── Loading / error ───────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex items-center gap-2 text-gray-400">
                    <RefreshCw size={18} className="animate-spin" />
                    Loading batch details…
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-2xl mx-auto mt-12 text-center space-y-4">
                <XCircle size={48} className="mx-auto text-red-400" />
                <p className="text-red-400 font-medium">{error}</p>
                <button onClick={() => navigate('/files')}
                    className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 text-sm">
                    ← Back to Files
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">

            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <button onClick={() => navigate('/files')}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 mb-2 transition-colors">
                        <ArrowLeft size={15} /> Back to Files
                    </button>
                    <h1 className="text-2xl font-bold text-[#d4a017] font-mono">{batch_id}</h1>
                    <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1.5">
                        <Calendar size={13} /> Created {formatDate(batch?.created_at)}
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    {batch?.mother_file_url && (
                        <a href={batch.mother_file_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
                            <ExternalLink size={13} /> Mother File
                        </a>
                    )}
                    <button onClick={loadData}
                        className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
                        <RefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={<Database size={16} />}    label="Total Rows" value={batch?.total_rows ?? '—'}  color="blue" />
                <StatCard icon={<Users size={16} />}       label="Clients"    value={clients.length}            color="blue" />
                <StatCard icon={<CheckCircle size={16} />} label="Sent"       value={sentCount}                 color="green" />
                <StatCard icon={<Clock size={16} />}       label="Pending"    value={pendingCount}              color="yellow" />
            </div>

            {/* ── Client table ── */}
            <div className="bg-[#1a1a1a] rounded-xl border border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-200">
                        Client List
                        <span className="ml-1.5 text-xs font-normal text-gray-500">({clients.length})</span>
                    </h2>
                    <button onClick={toggleAll} className="text-xs text-[#d4a017] hover:text-[#f2c94c] font-medium underline">
                        {selected.size === clients.length ? 'Unselect All' : 'Select All'}
                    </button>
                </div>

                {clients.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 text-sm">No clients found for this batch.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[#d4a017] border-b border-gray-700 text-xs text-black uppercase tracking-wide">
                                    <th className="px-4 py-2.5 text-left w-8"></th>
                                    <th className="px-4 py-2.5 text-left">Client</th>
                                    <th className="px-4 py-2.5 text-left">Email</th>
                                    <th className="px-4 py-2.5 text-left">Status</th>
                                    <th className="px-4 py-2.5 text-left">Files</th>
                                    <th className="px-4 py-2.5 text-left">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {clients.map((client) => (
                                    <tr key={client.client_name} className="hover:bg-gray-800 transition-colors">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(client.client_name)}
                                                onChange={() => toggleClient(client.client_name)}
                                                className="rounded border-gray-600 text-[#d4a017] bg-gray-800"
                                            />
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-200 whitespace-nowrap">
                                            {client.client_name}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {client.recipient_email || <span className="text-red-400 italic">No email</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={client.status || 'pending'} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {client.generated_url && (
                                                    <a href={client.generated_url} target="_blank" rel="noreferrer"
                                                        className="flex items-center gap-1 text-xs text-[#d4a017] hover:text-[#f2c94c]" title="Generated">
                                                        <FileText size={12} /> Gen
                                                    </a>
                                                )}
                                                {client.custom_url && (
                                                    <a href={client.custom_url} target="_blank" rel="noreferrer"
                                                        className="flex items-center gap-1 text-xs text-yellow-500 hover:text-yellow-300" title="Custom">
                                                        <Upload size={12} /> Custom
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setModalClient(client)}
                                                    className="text-xs px-3 py-1.5 bg-[#d4a017] text-black rounded-lg hover:bg-[#f2c94c] border border-transparent transition-colors font-semibold">
                                                    Manage
                                                </button>
                                                {client.status === 'failed' && (
                                                    <button
                                                        onClick={() => retryClient(client.client_name)}
                                                        disabled={retrying.has(client.client_name)}
                                                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-900/40 text-red-300 border border-red-700 rounded-lg hover:bg-red-900/70 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Retry sending email">
                                                        {retrying.has(client.client_name)
                                                            ? <RefreshCw size={11} className="animate-spin" />
                                                            : <RotateCcw size={11} />}
                                                        Retry
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Bulk send ── */}
            <WriteAccess fallback={
                <p className="text-sm text-gray-500 italic text-center py-2">Read-only access — sending disabled.</p>
            }>
                <div className="bg-[#1a1a1a] rounded-xl border border-gray-700 shadow-sm p-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-200">
                        Bulk Send — <span className="text-[#d4a017]">{selected.size} selected</span>
                    </p>
                    {sendResult && (
                        <div className="bg-green-900/40 border border-green-700 rounded-lg px-3 py-2 text-xs text-green-300">
                            ✅ Sent: {sendResult.total_sent} &nbsp;|&nbsp; Failed: {sendResult.failed}
                        </div>
                    )}
                    {sendError && (
                        <div className="bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-xs text-red-300">
                            {sendError}
                        </div>
                    )}
                    <button
                        onClick={handleBulkSend}
                        disabled={selected.size === 0 || sending}
                        className={`w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all
                            ${selected.size === 0 || sending
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-[#d4a017] text-black hover:bg-[#f2c94c] active:scale-[0.98] shadow-sm'}`}>
                        <Send size={15} />
                        {sending ? 'Sending…' : `Send to ${selected.size} client${selected.size !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </WriteAccess>

            {/* ── Per-client modal ── */}
            <MISClientModal
                isOpen={!!modalClient}
                client={modalClient}
                batchId={batch_id}
                onClose={() => setModalClient(null)}
                onSent={() => { loadData(); setModalClient(null); }}
            />
        </div>
    );
};

export default BatchDetailsPage;
