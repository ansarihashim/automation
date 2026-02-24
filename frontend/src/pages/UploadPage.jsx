import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, CheckCircle, FileText, X, AlertCircle, Clock, ChevronRight, Save } from 'lucide-react';
import api from '../services/api';
import WriteAccess from '../components/WriteAccess';

// ---------------------------------------------------------------------------
// Reusable drop zone
// ---------------------------------------------------------------------------
const DropZone = ({ label, description, file, onFile }) => {
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef(null);

    const isExcel = (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls');

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped && isExcel(dropped)) onFile(dropped);
    };

    const handleChange = (e) => {
        const picked = e.target.files?.[0];
        if (picked && isExcel(picked)) onFile(picked);
        e.target.value = '';
    };

    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-300">{label}</p>
            <div
                className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200
                    ${dragActive ? 'border-[#d4a017] bg-[#d4a017]/10'
                    : file ? 'border-green-600 bg-green-900/20'
                    : 'border-gray-600 hover:border-[#d4a017] hover:bg-gray-800/20'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !file && inputRef.current.click()}
            >
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />

                {file ? (
                    <div className="flex items-center justify-between bg-[#0f0f0f] border border-gray-700 rounded-lg px-4 py-3 max-w-sm mx-auto">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-green-900/40 rounded-lg text-green-400 shrink-0"><FileText size={18} /></div>
                            <div className="text-left min-w-0">
                                <p className="text-sm font-medium text-gray-200 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onFile(null); }}
                            className="ml-3 p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-colors shrink-0">
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center transition-all duration-200
                            ${dragActive ? 'bg-[#d4a017]/20 text-[#d4a017] scale-110' : 'bg-gray-800 text-gray-500'}`}>
                            <CloudUpload size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-400">{description}</p>
                            <p className="text-xs text-gray-500 mt-1">Supported formats: .xlsx, .xls</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); inputRef.current.click(); }}
                            className="inline-block mt-1 bg-[#0f0f0f] border border-gray-600 text-gray-300 text-sm px-5 py-2 rounded-lg font-medium hover:bg-gray-800 hover:border-gray-400 transition-all active:scale-95">
                            Browse Files
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


// ---------------------------------------------------------------------------
// Main Upload Page
// ---------------------------------------------------------------------------
const UploadPage = () => {
    const navigate = useNavigate();

    // Derive admin status once on mount
    const isAdmin = (() => {
        try { return JSON.parse(sessionStorage.getItem('user'))?.role === 'admin'; }
        catch { return false; }
    })();

    const [rawFile, setRawFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [processingMsg, setProcessingMsg] = useState('');
    const [warning, setWarning] = useState('');
    const [missingClients, setMissingClients] = useState([]);

    // Admin email-entry form state
    const [clientEmails, setClientEmails] = useState({});
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Recent batches
    const [recentBatches, setRecentBatches] = useState([]);
    const [recentLoading, setRecentLoading] = useState(true);

    useEffect(() => {
        api.get('/batches/recent')
            .then(res => setRecentBatches(res.data || []))
            .catch(() => {})
            .finally(() => setRecentLoading(false));
    }, []);

    const canSubmit = rawFile && !loading;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setLoading(true);
        setError('');
        setWarning('');
        setProcessingMsg('Processing file\u2026 This may take up to 1\u20132 minutes.');
        setMissingClients([]);
        setClientEmails({});
        setSaveSuccess(false);

        const timer = setTimeout(() => {
            setWarning('Processing is taking longer than usual. Please wait. Do not refresh the page.');
        }, 30000);

        try {
            const formData = new FormData();
            formData.append('master_file', rawFile);
            const res = await api.post('/upload/master', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 120000,
            });

            clearTimeout(timer);
            const data = res.data;

            if (data.status === 'missing_clients') {
                setMissingClients(data.missing_clients || []);
                setError('Some clients are missing email addresses. Please contact an admin to add them.');
                setProcessingMsg('');
                setWarning('');
                setLoading(false);
                return;
            }

            if (data.status === 'failed') {
                setError(data.message || 'Upload failed. Please contact an admin.');
                setMissingClients(data.missing_clients || []);
                setProcessingMsg('');
                setWarning('');
                setLoading(false);
                return;
            }

            // status === 'success'
            setProcessingMsg('File processed successfully.');
            setWarning('');
            navigate(`/batches/${data.batch_id}`);
        } catch (e) {
            clearTimeout(timer);
            setProcessingMsg('');
            setWarning('');
            const detail = e.response?.data?.detail;
            if (detail && typeof detail === 'object' && detail.missing_clients) {
                setMissingClients(detail.missing_clients);
                setError(detail.message || 'Missing client emails. Please contact admin.');
            } else if (!e.response) {
                setError('Server is not reachable. Please try again.');
            } else {
                setError(Array.isArray(detail) ? detail.map(d => d.msg).join('\n') : (detail || 'Processing failed. Please try uploading again.'));
            }
            setLoading(false);
        }
    };

    const handleEmailChange = (clientName, value) => {
        setClientEmails(prev => ({ ...prev, [clientName]: value }));
    };

    const canSaveEmails =
        missingClients.length > 0 &&
        missingClients.every(c => (clientEmails[c] || '').trim() !== '');

    const handleSaveEmails = async () => {
        if (!canSaveEmails) return;
        setSaveLoading(true);
        setSaveSuccess(false);
        try {
            const payload = {
                clients: missingClients.map(c => ({
                    client_name: c,
                    email: clientEmails[c].trim(),
                })),
            };
            await api.post('/admin/clients/bulk', payload);
            setSaveSuccess(true);
            setMissingClients([]);
            setClientEmails({});
            setError('');
        } catch (e) {
            const detail = e.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to save emails. Please try again.');
        } finally {
            setSaveLoading(false);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-[#d4a017]">Upload Files</h1>
                <p className="text-gray-400 mt-1 text-sm">
                    Upload raw shipment file to create a batch.
                </p>
            </div>

            {/* ── Upload Card ── */}
            <div className="bg-[#1a1a1a] rounded-xl border border-gray-700 shadow-sm p-6 space-y-6">
                <DropZone
                    label="Upload Raw File"
                    description="Drag & drop your raw Excel file here"
                    file={rawFile}
                    onFile={setRawFile}
                />

                {/* ── Save-success banner ── */}
                {saveSuccess && (
                    <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 text-green-300 text-sm rounded-lg px-4 py-3">
                        <CheckCircle size={16} className="shrink-0" />
                        <span>Emails saved successfully. Please upload the file again to continue.</span>
                    </div>
                )}

                {/* ── Generic error (no missing clients) ── */}
                {error && missingClients.length === 0 && (
                    <div className="flex items-start gap-2 bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── Missing clients panel ── */}
                {missingClients.length > 0 && (
                    <div className="rounded-lg border border-amber-700 bg-amber-900/20 p-4 space-y-4">
                        <div className="flex items-start gap-2 text-amber-300">
                            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                            <div>
                                <p className="text-sm font-semibold">Missing client email addresses</p>
                                {isAdmin
                                    ? <p className="text-xs text-amber-400 mt-0.5">Please add emails for missing clients below, then re-upload.</p>
                                    : <p className="text-xs text-amber-400 mt-0.5">Please contact an admin to add the missing emails before uploading.</p>
                                }
                            </div>
                        </div>

                        {isAdmin ? (
                            /* ── Admin: email entry form ── */
                            <div className="space-y-3">
                                {missingClients.map(client => (
                                    <div key={client} className="flex items-center gap-3">
                                        <span className="w-52 shrink-0 text-xs font-mono font-medium text-gray-300 truncate" title={client}>
                                            {client}
                                        </span>
                                        <input
                                            type="email"
                                            placeholder="email@example.com"
                                            value={clientEmails[client] || ''}
                                            onChange={e => handleEmailChange(client, e.target.value)}
                                            className="flex-1 text-sm bg-[#0f0f0f] border border-gray-600 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] placeholder-gray-600"
                                        />
                                    </div>
                                ))}

                                <button
                                    onClick={handleSaveEmails}
                                    disabled={!canSaveEmails || saveLoading}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150
                                        ${canSaveEmails && !saveLoading
                                            ? 'bg-[#d4a017] text-black hover:bg-[#f2c94c] active:scale-[0.98] shadow-sm'
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                >
                                    <Save size={14} />
                                    {saveLoading ? 'Saving…' : 'Save Emails'}
                                </button>
                            </div>
                        ) : (
                            /* ── Non-admin: read-only list ── */
                            <ul className="space-y-1 ml-1">
                                {missingClients.map(c => (
                                    <li key={c} className="text-xs font-mono text-amber-300 bg-amber-900/30 rounded px-2 py-0.5 inline-block mr-1 mb-1">
                                        {c}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* ── Processing spinner ── */}
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <div className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-[#d4a017] rounded-full shrink-0" />
                        Processing your file…
                    </div>
                )}

                {/* ── Processing info box (shown while loading) ── */}
                {loading && processingMsg && (
                    <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-lg text-sm text-blue-300">
                        {processingMsg}
                    </div>
                )}

                {/* ── 30-second warning ── */}
                {warning && (
                    <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg text-sm text-yellow-300">
                        {warning}
                    </div>
                )}

                {/* ── Success message (brief flash before navigation) ── */}
                {!loading && processingMsg && !error && (
                    <div className="p-3 bg-green-900/20 border border-green-700 rounded-lg text-sm text-green-300">
                        {processingMsg}
                    </div>
                )}

                <WriteAccess fallback={
                    <p className="text-sm text-gray-500 italic text-center py-2">Read-only access — uploading is disabled.</p>
                }>
                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className={`w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150
                            ${canSubmit
                                ? 'bg-[#d4a017] text-black hover:bg-[#f2c94c] active:scale-[0.98] shadow-sm hover:shadow-md'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                        {loading ? 'Processing…' : 'Process & Upload'}
                    </button>
                </WriteAccess>
            </div>

            {/* ── Recent Batches ── */}
            <div className="bg-[#1a1a1a] rounded-xl border border-gray-700 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-200">Recent Batches</h2>
                </div>
                {recentLoading ? (
                    <div className="py-6 text-center text-xs text-gray-500">Loading…</div>
                ) : recentBatches.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-500">No batches yet. Upload your first file above.</div>
                ) : (
                    <ul className="divide-y divide-gray-700">
                        {recentBatches.map(batch => (
                            <li key={batch.batch_id}
                                onClick={() => navigate(`/batches/${batch.batch_id}`)}
                                className="flex items-center justify-between px-4 py-3 hover:bg-gray-800 cursor-pointer transition-colors group">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-200 font-mono truncate">{batch.batch_id}</p>
                                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                        <Clock size={11} /> {formatDate(batch.created_at)}
                                        <span className="ml-2 text-gray-600">·</span>
                                        <span className="ml-1">{batch.total_clients ?? batch.total_rows ?? '—'} clients</span>
                                    </p>
                                </div>
                                <ChevronRight size={15} className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default UploadPage;
