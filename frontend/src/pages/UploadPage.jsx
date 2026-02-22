import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, CheckCircle, FileText, X, AlertCircle, Clock, ChevronRight } from 'lucide-react';
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
// Main Upload Page
// ---------------------------------------------------------------------------
const UploadPage = () => {
    const navigate = useNavigate();
    const [rawFile, setRawFile] = useState(null);
    const [emailFile, setEmailFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Recent batches
    const [recentBatches, setRecentBatches] = useState([]);
    const [recentLoading, setRecentLoading] = useState(true);

    useEffect(() => {
        api.get('/batches/recent')
            .then(res => setRecentBatches(res.data || []))
            .catch(() => {})
            .finally(() => setRecentLoading(false));
    }, []);

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
                timeout: 120000,
            });
            // Navigate to batch details page
            navigate(`/batches/${res.data.batch_id}`);
        } catch (e) {
            const detail = e.response?.data?.detail;
            setError(Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || e.message));
            setLoading(false);
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
                <h1 className="text-2xl font-semibold text-gray-900">Upload Files</h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Upload raw shipment file and client email file to create a batch.
                </p>
            </div>

            {/* ── Upload Card ── */}
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

                <WriteAccess fallback={
                    <p className="text-sm text-gray-400 italic text-center py-2">Read-only access — uploading is disabled.</p>
                }>
                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className={`w-full py-3 rounded-lg font-semibold text-white text-sm transition-all duration-150
                            ${canSubmit
                                ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-sm hover:shadow-md'
                                : 'bg-gray-300 cursor-not-allowed'}`}>
                        {loading ? 'Processing…' : 'Process & Upload'}
                    </button>
                </WriteAccess>
            </div>

            {/* ── Recent Batches ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-800">Recent Batches</h2>
                </div>
                {recentLoading ? (
                    <div className="py-6 text-center text-xs text-gray-400">Loading…</div>
                ) : recentBatches.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-400">No batches yet. Upload your first file above.</div>
                ) : (
                    <ul className="divide-y divide-gray-50">
                        {recentBatches.map(batch => (
                            <li key={batch.batch_id}
                                onClick={() => navigate(`/batches/${batch.batch_id}`)}
                                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors group">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 font-mono truncate">{batch.batch_id}</p>
                                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                        <Clock size={11} /> {formatDate(batch.created_at)}
                                        <span className="ml-2 text-gray-300">·</span>
                                        <span className="ml-1">{batch.total_clients ?? batch.total_rows ?? '—'} clients</span>
                                    </p>
                                </div>
                                <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default UploadPage;
