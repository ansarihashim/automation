import React, { useState, useRef } from 'react';
import { CloudUpload, CheckCircle, FileText, X, AlertCircle, Send } from 'lucide-react';
import api from '../services/api';

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
            <p className="text-sm font-semibold text-gray-700">{label}</p>
            <div
                className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200
                    ${dragActive ? 'border-blue-500 bg-blue-50'
                    : file ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !file && inputRef.current.click()}
            >
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />

                {file ? (
                    <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 max-w-sm mx-auto shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-green-100 rounded-lg text-green-600 shrink-0"><FileText size={18} /></div>
                            <div className="text-left min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onFile(null); }}
                            className="ml-3 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center transition-all duration-200
                            ${dragActive ? 'bg-blue-100 text-blue-600 scale-110' : 'bg-gray-100 text-gray-400'}`}>
                            <CloudUpload size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-700">{description}</p>
                            <p className="text-xs text-gray-400 mt-1">Supported formats: .xlsx, .xls</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); inputRef.current.click(); }}
                            className="inline-block mt-1 bg-white border border-gray-300 text-gray-700 text-sm px-5 py-2 rounded-lg font-medium hover:bg-gray-50 hover:border-gray-400 transition-all active:scale-95">
                            Browse Files
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Client Selection Panel (shown after successful upload)
// ---------------------------------------------------------------------------
const LIMIT_OPTIONS = [1, 2, 5, 10];

const ClientPanel = ({ batchId, onReset }) => {
    const [clients, setClients] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState('');

    const [limitMode, setLimitMode] = useState('all'); // '1'|'2'|'5'|'10'|'all'|'custom'
    const [customLimit, setCustomLimit] = useState('');

    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [sendError, setSendError] = useState('');

    // Fetch clients on mount
    React.useEffect(() => {
        (async () => {
            try {
                const res = await api.get(`/batches/${batchId}/clients`);
                setClients(res.data);
                setSelected(new Set(res.data.map(c => c.client_name)));
            } catch (e) {
                setFetchError('Failed to load client list: ' + (e.response?.data?.detail || e.message));
            } finally {
                setLoading(false);
            }
        })();
    }, [batchId]);

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

    const getLimit = () => {
        if (limitMode === 'all') return null;
        if (limitMode === 'custom') return customLimit ? parseInt(customLimit) : null;
        return parseInt(limitMode);
    };

    const handleSend = async () => {
        if (selected.size === 0) return;
        setSending(true);
        setSendError('');
        setSendResult(null);
        try {
            const res = await api.post('/email/send-mis', {
                batch_id: batchId,
                clients: Array.from(selected),
                limit: getLimit(),
            });
            setSendResult(res.data);
        } catch (e) {
            setSendError(e.response?.data?.detail || e.message);
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="text-center py-10 text-gray-400 text-sm">Loading client list...</div>;
    if (fetchError) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{fetchError}</div>;

    return (
        <div className="space-y-5">

            {/* Batch confirmation banner */}
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 shrink-0">
                    <CheckCircle size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800">Batch created successfully</p>
                    <p className="text-xs text-green-600 font-mono">{batchId}</p>
                </div>
                <button onClick={onReset} className="text-xs text-green-700 underline hover:text-green-900 shrink-0">
                    New upload
                </button>
            </div>

            {/* Client table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-800">
                        Client MIS Files
                        <span className="ml-2 text-xs font-normal text-gray-400">({clients.length} clients)</span>
                    </h2>
                    <button onClick={toggleAll}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium underline">
                        {selected.size === clients.length ? 'Unselect All' : 'Select All'}
                    </button>
                </div>

                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <th className="px-4 py-2.5 w-10"></th>
                            <th className="px-4 py-2.5">Client Name</th>
                            <th className="px-4 py-2.5">Email</th>
                            <th className="px-4 py-2.5">File</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((c, i) => (
                            <tr key={c.client_name}
                                className={`border-t border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                onClick={() => toggleClient(c.client_name)}>
                                <td className="px-4 py-2.5">
                                    <input type="checkbox" readOnly checked={selected.has(c.client_name)}
                                        className="w-4 h-4 accent-blue-600 cursor-pointer" />
                                </td>
                                <td className="px-4 py-2.5 font-medium text-gray-800">{c.client_name}</td>
                                <td className="px-4 py-2.5 text-gray-500">{c.email || <span className="text-red-400">No email</span>}</td>
                                <td className="px-4 py-2.5">
                                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                                        <FileText size={11} />{c.file_name}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                    Selected: <span className="font-semibold text-gray-800">{selected.size}</span> of {clients.length} clients
                </div>
            </div>

            {/* Send controls */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Send Options</p>

                <div className="flex flex-wrap gap-2">
                    {LIMIT_OPTIONS.map(n => (
                        <button key={n} onClick={() => setLimitMode(String(n))}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all
                                ${limitMode === String(n)
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                            {n}
                        </button>
                    ))}
                    <button onClick={() => setLimitMode('all')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all
                            ${limitMode === 'all'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                        All
                    </button>
                    <button onClick={() => setLimitMode('custom')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all
                            ${limitMode === 'custom'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                        Custom
                    </button>
                    {limitMode === 'custom' && (
                        <input type="number" min="1" value={customLimit}
                            onChange={e => setCustomLimit(e.target.value)}
                            placeholder="Enter number"
                            className="w-32 px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    )}
                </div>

                {sendError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        <span>{sendError}</span>
                    </div>
                )}

                {sendResult && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm space-y-1">
                        <p className="font-semibold text-green-800">{sendResult.message}</p>
                        <p className="text-green-700">Sent: <strong>{sendResult.total_sent}</strong> &nbsp;Â·&nbsp; Failed: <strong>{sendResult.failed}</strong></p>
                        {sendResult.errors?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {sendResult.errors.map((e, i) => (
                                    <li key={i} className="text-red-600 text-xs">{e.client}: {e.reason}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <button onClick={handleSend} disabled={selected.size === 0 || sending}
                    className={`w-full py-3 rounded-lg font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all
                        ${selected.size === 0 || sending
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-sm hover:shadow-md'}`}>
                    <Send size={16} />
                    {sending ? 'Sending...' : `Send Emails (${selected.size} selected)`}
                </button>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main Upload Page
// ---------------------------------------------------------------------------
const UploadPage = () => {
    const [rawFile, setRawFile] = useState(null);
    const [emailFile, setEmailFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [batchId, setBatchId] = useState(null);
    const [error, setError] = useState('');

    const canSubmit = rawFile && emailFile && !loading;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setLoading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('master_file', rawFile);
            formData.append('email_file', emailFile);
            const res = await api.post('/upload/master', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setBatchId(res.data.batch_id);
        } catch (e) {
            const detail = e.response?.data?.detail;
            setError(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || e.message));
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setBatchId(null);
        setError('');
        setRawFile(null);
        setEmailFile(null);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Upload Files</h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Upload raw shipment file and client email file to create a batch.
                </p>
            </div>

            {batchId ? (
                <ClientPanel batchId={batchId} onReset={handleReset} />
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                    <DropZone
                        label="Upload Raw File"
                        description="Drag & drop your raw Excel file here"
                        file={rawFile}
                        onFile={setRawFile}
                    />
                    <DropZone
                        label="Upload Email File"
                        description="Upload file containing Client Name and Client Email"
                        file={emailFile}
                        onFile={setEmailFile}
                    />

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className={`w-full py-3 rounded-lg font-semibold text-white text-sm transition-all duration-150
                            ${canSubmit
                                ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-sm hover:shadow-md'
                                : 'bg-gray-300 cursor-not-allowed'}`}>
                        {loading ? 'Processing...' : 'Process'}
                    </button>
                </div>
            )}


        </div>
    );
};

export default UploadPage;
