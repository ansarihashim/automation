import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, {
    getAdminClients,
    upsertAdminClient,
    deleteAdminClient,
    bulkImportClients,
} from '../services/api';

// ---------------------------------------------------------------------------
// Tiny reusable components
// ---------------------------------------------------------------------------

function Spinner() {
    return (
        <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-red-200 border-t-red-500 rounded-full animate-spin" />
        </div>
    );
}

function Toast({ message, type, onClose }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3500);
        return () => clearTimeout(t);
    }, [onClose]);

    const colors =
        type === 'success'
            ? 'bg-green-900/30 border-green-700 text-green-300'
            : 'bg-red-900/30 border-red-700 text-red-300';

    return (
        <div
            className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-4 py-3 border rounded-xl shadow-lg text-sm font-medium animate-fade-in ${colors}`}
        >
            <span>{message}</span>
            <button
                onClick={onClose}
                className="ml-1 opacity-60 hover:opacity-100 text-lg leading-none"
            >
                ×
            </button>
        </div>
    );
}

function ConfirmDialog({ message, onConfirm, onCancel, loading }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
                <h3 className="text-base font-semibold text-white mb-2">Confirm Delete</h3>
                <p className="text-sm text-gray-400 mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-2"
                    >
                        {loading && (
                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        )}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

function ClientModal({ initial, onSave, onClose, loading }) {
    const [clientName, setClientName] = useState(initial?.client_name ?? '');
    const [emails, setEmails]         = useState(
        initial?.emails?.length ? [...initial.emails] : ['']
    );
    const [error, setError] = useState('');

    const isEdit = Boolean(initial);

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const addEmail = () => {
        if (emails.length < 5) setEmails((prev) => [...prev, '']);
    };

    const removeEmail = (idx) => {
        if (emails.length === 1) return; // keep at least 1 input
        setEmails((prev) => prev.filter((_, i) => i !== idx));
    };

    const updateEmail = (idx, val) => {
        setEmails((prev) => prev.map((e, i) => (i === idx ? val : e)));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        const trimName = clientName.trim();
        if (!trimName) return setError('Client name is required.');

        const valid = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
        if (!valid.length) return setError('At least one email address is required.');

        for (const em of valid) {
            if (!EMAIL_RE.test(em))
                return setError(`"${em}" is not a valid email address.`);
        }
        const deduped = [...new Set(valid)];
        if (deduped.length > 5) return setError('A maximum of 5 email addresses is allowed.');

        onSave({ client_name: trimName, emails: deduped });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
                <h2 className="text-base font-semibold text-white mb-5">
                    {isEdit ? `Edit emails — ${initial.client_name}` : 'Add Client'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Client Name */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                            Client Name
                        </label>
                        <input
                            type="text"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            disabled={isEdit}
                            placeholder="e.g. AJANTA PHARMA"
                            className="w-full px-3 py-2 text-sm bg-[#0f0f0f] border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] outline-none disabled:opacity-50 disabled:cursor-not-allowed placeholder-gray-600 transition"
                        />
                        {!isEdit && (
                            <p className="text-[11px] text-gray-500 mt-1">
                                Should match exactly as it appears in uploaded Excel files.
                            </p>
                        )}
                    </div>

                    {/* Email Inputs */}
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-400">
                            Email Addresses
                            <span className="ml-1 text-gray-500 font-normal">(max 5)</span>
                        </label>
                        {emails.map((em, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <input
                                    type="email"
                                    value={em}
                                    onChange={(e) => updateEmail(idx, e.target.value)}
                                    placeholder={`Email ${idx + 1}`}
                                    className="flex-1 px-3 py-2 text-sm bg-[#0f0f0f] border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] outline-none placeholder-gray-600 transition"
                                />
                                {emails.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeEmail(idx)}
                                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition"
                                        title="Remove"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        {emails.length < 5 && (
                            <button
                                type="button"
                                onClick={addEmail}
                                className="text-xs text-[#d4a017] hover:text-[#f2c94c] font-medium mt-1 hover:underline"
                            >
                                + Add another email
                            </button>
                        )}
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3 justify-end pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2 text-sm font-medium text-black bg-[#d4a017] rounded-lg hover:bg-[#f2c94c] disabled:opacity-50 transition flex items-center gap-2"
                        >
                            {loading && (
                                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            )}
                            {isEdit ? 'Save Changes' : 'Add Client'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Bulk Import Modal
// ---------------------------------------------------------------------------

function BulkImportModal({ onImport, onClose, loading }) {
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState([]);

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Re-parse preview whenever text changes
    useEffect(() => {
        if (!text.trim()) { setPreview([]); return; }
        const parsed = parseInput(text);
        setPreview(parsed.valid);
    }, [text]);

    const parseInput = (raw) => {
        const valid = [];
        const invalid = [];

        for (const line of raw.split('\n')) {
            const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
            if (!parts.length) continue;

            const client_name = parts[0].toUpperCase();
            const emails = parts
                .slice(1)
                .map((e) => e.toLowerCase())
                .filter((e) => EMAIL_RE.test(e));

            // Deduplicate
            const deduped = [...new Set(emails)];

            if (!client_name) { invalid.push(line); continue; }
            if (deduped.length === 0) { invalid.push(line); continue; }
            if (deduped.length > 5) { invalid.push(`${client_name}: max 5 emails`); continue; }

            valid.push({ client_name, emails: deduped });
        }

        return { valid, invalid };
    };

    const handleImport = () => {
        setError('');
        if (!text.trim()) return setError('Paste at least one line of data.');

        const { valid, invalid } = parseInput(text);

        if (invalid.length) {
            setError(
                `${invalid.length} line(s) could not be parsed: ensure format is\n` +
                `CLIENT NAME,email1@example.com,email2@example.com`
            );
            return;
        }
        if (!valid.length) return setError('No valid clients found.');

        onImport(valid);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 flex flex-col gap-4">
                <div>
                    <h2 className="text-base font-semibold text-white">Bulk Import Clients</h2>
                    <p className="text-xs text-gray-400 mt-1">
                        One client per line. Format:
                        <code className="ml-1 px-1 py-0.5 bg-gray-800 text-gray-300 rounded text-[11px]">
                            CLIENT NAME,email1@example.com,email2@example.com
                        </code>
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder={
                        'AJANTA PHARMA,mis@ajanta.com,accounts@ajanta.com\n' +
                        'ENZA ZADEN,enza@company.com\n' +
                        'CLIENT C,info@clientc.com'
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#0f0f0f] border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] outline-none resize-none placeholder-gray-600 transition"
                />

                {/* Preview */}
                {preview.length > 0 && (
                    <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 max-h-32 overflow-y-auto">
                        <p className="font-semibold text-gray-200 mb-1">
                            {preview.length} client{preview.length !== 1 ? 's' : ''} ready to import:
                        </p>
                        {preview.map((c) => (
                            <div key={c.client_name} className="truncate">
                                <span className="font-medium">{c.client_name}</span>
                                <span className="text-gray-500 ml-1">→ {c.emails.join(', ')}</span>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 whitespace-pre-line">
                        {error}
                    </p>
                )}

                <div className="flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={loading || !preview.length}
                        className="px-5 py-2 text-sm font-medium text-black bg-[#d4a017] rounded-lg hover:bg-[#f2c94c] disabled:opacity-50 transition flex items-center gap-2"
                    >
                        {loading && (
                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        )}
                        Import {preview.length > 0 ? `(${preview.length})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ClientEmailsPage() {
    const { isAdmin } = useAuth();

    if (!isAdmin) return <Navigate to="/upload" replace />;

    const [clients,    setClients]    = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [search,     setSearch]     = useState('');
    const [modal,      setModal]      = useState(null); // null | { mode: 'add' | 'edit', client? }
    const [modalBusy,  setModalBusy]  = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // client_name string
    const [deleteBusy,   setDeleteBusy]   = useState(false);
    const [bulkModal,    setBulkModal]    = useState(false);
    const [bulkBusy,     setBulkBusy]    = useState(false);
    const [toast,      setToast]      = useState(null); // { message, type }
    const [missingRequests, setMissingRequests] = useState([]);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
    }, []);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchClients = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminClients({ limit: 500 });
            setClients(data.clients ?? data ?? []);
        } catch (err) {
            showToast(err?.response?.data?.detail ?? 'Failed to load clients.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    const fetchMissingRequests = useCallback(async () => {
        try {
            const res = await api.get('/admin/clients/missing-requests');
            setMissingRequests(res.data ?? []);
        } catch (e) {
            if (e.response?.status === 404) {
                console.warn('Missing requests endpoint not available');
                setMissingRequests([]);
            } else {
                console.error('Failed to load missing client requests', e);
            }
        }
    }, []);

    useEffect(() => { fetchClients(); }, [fetchClients]);
    useEffect(() => { fetchMissingRequests(); }, [fetchMissingRequests]);

    // ── Filtered list ──────────────────────────────────────────────────────
    const filtered = clients.filter((c) => {
        const q = search.toLowerCase();
        return (
            c.client_name.toLowerCase().includes(q) ||
            (c.emails ?? []).some((e) => e.toLowerCase().includes(q))
        );
    });

    // ── Save (add / edit) ──────────────────────────────────────────────────
    const handleSave = async ({ client_name, emails }) => {
        setModalBusy(true);
        try {
            await upsertAdminClient({ client_name, emails });
            showToast(
                modal?.mode === 'edit'
                    ? `Emails updated for ${client_name}.`
                    : `${client_name} added successfully.`
            );
            setModal(null);
            fetchClients();
            fetchMissingRequests(); // refresh banner after a client is saved
        } catch (err) {
            showToast(err?.response?.data?.detail ?? 'Save failed.', 'error');
        } finally {
            setModalBusy(false);
        }
    };

    // ── Bulk Import ──────────────────────────────────────────────────────
    const handleBulkImport = async (clientsArray) => {
        setBulkBusy(true);
        try {
            // Ensure emails is always an array and data is clean before sending
            const payload = clientsArray.map((c) => ({
                client_name: c.client_name.trim().toUpperCase(),
                emails: (Array.isArray(c.emails) ? c.emails : [c.emails])
                    .map((e) => e.trim().toLowerCase())
                    .filter(Boolean),
            }));
            const result = await bulkImportClients(payload);
            showToast(
                `Bulk import complete — ${result.inserted ?? 0} added, ${result.modified ?? 0} updated.`
            );
            setBulkModal(false);
            fetchClients();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (typeof detail === 'object' && detail?.error) {
                showToast(detail.error, 'error');
            } else if (err?.response?.status === 422) {
                showToast(
                    'Some client emails are invalid or exceed the limit of 5.',
                    'error'
                );
            } else {
                showToast(
                    typeof detail === 'string' ? detail : 'Bulk import failed.',
                    'error'
                );
            }
        } finally {
            setBulkBusy(false);
        }
    };
    // ── Resolve missing request ─────────────────────────────────────────
    const resolveRequest = async (clientName) => {
        try {
            await api.post('/admin/clients/resolve-missing', null, {
                params: { client_name: clientName },
            });
            fetchMissingRequests();
        } catch (err) {
            showToast(
                err?.response?.data?.detail ?? 'Failed to resolve request.',
                'error'
            );
        }
    };
    // ── Delete ─────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        setDeleteBusy(true);
        try {
            await deleteAdminClient(deleteTarget);
            showToast(`${deleteTarget} deleted.`);
            setDeleteTarget(null);
            fetchClients();
        } catch (err) {
            showToast(err?.response?.data?.detail ?? 'Delete failed.', 'error');
        } finally {
            setDeleteBusy(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Page header */}
            <div className="mb-6">
                <h1 className="text-xl font-bold text-[#d4a017] flex items-center gap-2">
                    Client Emails
                    {missingRequests.length > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-900/30 text-yellow-300 border border-yellow-700">
                            {missingRequests.length} pending
                        </span>
                    )}
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">
                    Manage recipient email addresses for MIS reports.
                </p>
            </div>

            {/* Missing client requests banner */}
            {missingRequests.length > 0 && (
                <div className="mb-5 p-4 bg-yellow-900/20 border border-yellow-700 rounded-xl">
                    <div className="font-semibold text-yellow-300 text-sm mb-2">
                        ⚠️ Missing email requests ({missingRequests.length})
                    </div>
                    <ul className="text-sm text-yellow-400 space-y-1.5">
                        {missingRequests.map((r, i) => (
                            <li key={i} className="flex items-center justify-between gap-3">
                                <span>
                                    <span className="font-medium">{r.client_name}</span>
                                    {' '}— requested by{' '}
                                    <span className="font-medium">{r.requested_by}</span>
                                </span>
                                <button
                                    onClick={() => resolveRequest(r.client_name)}
                                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-300 border border-yellow-600 hover:bg-yellow-500/40 transition-colors font-semibold"
                                >
                                    Mark as Done
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-yellow-500 mt-2">
                        Add emails for these clients to resolve requests automatically, or click “Mark as Done” to dismiss.
                    </p>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="flex-1 px-4 py-2.5 text-sm bg-[#0f0f0f] border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] outline-none placeholder-gray-600 transition"
                />
                <button
                    onClick={() => setBulkModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#d4a017] bg-[#d4a017]/10 border border-[#d4a017]/30 rounded-xl hover:bg-[#d4a017]/20 transition shrink-0"
                >
                    <span className="text-base leading-none">⇧</span>
                    Bulk Import
                </button>
                <button
                    onClick={() => setModal({ mode: 'add' })}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-black bg-[#d4a017] rounded-xl hover:bg-[#f2c94c] transition shrink-0"
                >
                    <span className="text-base leading-none">+</span>
                    Add Client
                </button>
            </div>

            {/* Table */}
            <div className="bg-[#1a1a1a] rounded-2xl border border-gray-700 overflow-hidden shadow-sm">
                {loading ? (
                    <Spinner />
                ) : filtered.length === 0 ? (
                    <div className="py-20 text-center text-sm text-gray-500">
                        {search
                            ? 'No clients match your search.'
                            : 'No clients yet. Click "Add Client" to get started.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 bg-[#d4a017]">
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-black uppercase tracking-wide w-8">
                                        #
                                    </th>
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-black uppercase tracking-wide">
                                        Client Name
                                    </th>
                                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-black uppercase tracking-wide">
                                        Emails
                                    </th>
                                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-black uppercase tracking-wide">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filtered.map((client, idx) => (
                                    <tr
                                        key={client.client_name}
                                        className="hover:bg-gray-800 transition-colors"
                                    >
                                        <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">
                                            {idx + 1}
                                        </td>
                                        <td className="px-5 py-3.5 font-medium text-gray-200">
                                            {client.client_name}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {(client.emails ?? []).length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {client.emails.map((em) => (
                                                        <span
                                                            key={em}
                                                            className="inline-block text-xs bg-gray-700 text-gray-300 rounded-full px-2.5 py-0.5"
                                                        >
                                                            {em}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-amber-400 text-xs font-medium">
                                                    — not set —
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() =>
                                                        setModal({ mode: 'edit', client })
                                                    }
                                                    className="px-3 py-1.5 text-xs font-medium text-[#d4a017] bg-[#d4a017]/10 rounded-lg hover:bg-[#d4a017]/20 transition"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setDeleteTarget(client.client_name)
                                                    }
                                                    className="px-3 py-1.5 text-xs font-medium text-red-400 bg-red-900/20 rounded-lg hover:bg-red-900/40 transition"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer count */}
                {!loading && filtered.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-700 text-xs text-gray-500 flex justify-between items-center">
                        <span>
                            {filtered.length} of {clients.length} client
                            {clients.length !== 1 ? 's' : ''}
                        </span>
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="text-[#d4a017] hover:underline"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Bulk import modal */}
            {bulkModal && (
                <BulkImportModal
                    onImport={handleBulkImport}
                    onClose={() => setBulkModal(false)}
                    loading={bulkBusy}
                />
            )}

            {/* Add / Edit modal */}
            {modal && (
                <ClientModal
                    initial={modal.mode === 'edit' ? modal.client : null}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                    loading={modalBusy}
                />
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <ConfirmDialog
                    message={`Delete "${deleteTarget}"? This cannot be undone.`}
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteTarget(null)}
                    loading={deleteBusy}
                />
            )}

            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}
