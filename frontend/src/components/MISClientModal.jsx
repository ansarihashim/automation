import React, { useState, useRef } from 'react';
import { X, Building2, Mail, FileText, Download, Upload, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

/**
 * MISClientModal
 *
 * Props:
 *  - isOpen       {boolean}
 *  - client       {{ client_name, safe_name, generated_file, custom_file_exists, recipient_email }}
 *  - batchId      {string}
 *  - onClose      {() => void}
 *  - onSent       {() => void}   – called after a successful send so parent can refresh
 */
const MISClientModal = ({ isOpen, client, batchId, onClose, onSent }) => {
    const [fileType, setFileType] = useState('generated');   // 'generated' | 'custom'
    const [uploading, setUploading] = useState(false);
    const [uploadDone, setUploadDone] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [customExists, setCustomExists] = useState(false);

    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [sendError, setSendError] = useState('');

    const fileRef = useRef(null);

    // Sync customExists from parent data whenever client changes
    React.useEffect(() => {
        if (client) {
            setCustomExists(client.custom_file_exists);
            setFileType(client.custom_file_exists ? 'custom' : 'generated');
            setUploadDone(false);
            setUploadError('');
            setSendResult(null);
            setSendError('');
        }
    }, [client]);

    if (!isOpen || !client) return null;

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith('.xlsx')) {
            setUploadError('Only .xlsx files are accepted.');
            return;
        }

        setUploading(true);
        setUploadError('');
        setUploadDone(false);

        const form = new FormData();
        form.append('batch_id', batchId);
        form.append('client_name', client.safe_name);
        form.append('file', file);

        try {
            await api.post('/email/upload-custom', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setCustomExists(true);
            setFileType('custom');
            setUploadDone(true);
        } catch (err) {
            setUploadError(err.response?.data?.detail || err.message);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleSend = async () => {
        setSending(true);
        setSendError('');
        setSendResult(null);
        try {
            const res = await api.post('/email/send-mis', {
                batch_id: batchId,
                clients: [client.client_name],
                limit: 1,
                file_type: fileType,
            });
            setSendResult(res.data);
            if (onSent) onSent();
        } catch (err) {
            setSendError(err.response?.data?.detail || err.message);
        } finally {
            setSending(false);
        }
    };

    const downloadUrl = (type) => {
        if (type === 'generated' && client.generated_url) return client.generated_url;
        if (type === 'custom' && client.custom_url) return client.custom_url;
        // Fallback: backend download endpoint (redirects to Cloudinary)
        const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        return `${base}/api/email/download/${batchId}/${type}/${client.safe_name}`;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                            <Building2 size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-gray-900">{client.client_name}</h3>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Mail size={11} /> {client.recipient_email || <span className="text-red-400">No email on file</span>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="p-5 space-y-5 overflow-y-auto">

                    {/* Attachment section */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachment</p>

                        {/* Generated file row */}
                        <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-200 mb-2">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <FileText size={15} className="text-green-600" />
                                <span className="font-medium">{client.generated_file}</span>
                                <span className="text-xs text-gray-400">(Generated)</span>
                            </div>
                            <a
                                href={downloadUrl('generated')}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Download size={13} /> Download
                            </a>
                        </div>

                        {/* Custom file row */}
                        {customExists && (
                            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-yellow-50 border border-yellow-200 mb-2">
                                <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <FileText size={15} className="text-yellow-600" />
                                    <span className="font-medium">{client.safe_name}.xlsx</span>
                                    <span className="text-xs text-yellow-600">(Custom)</span>
                                </div>
                                <a
                                    href={downloadUrl('custom')}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Download size={13} /> Download
                                </a>
                            </div>
                        )}

                        {/* Upload custom file */}
                        <div className="mt-3">
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx"
                                className="hidden"
                                onChange={handleUpload}
                            />
                            <button
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-blue-700 border border-dashed border-gray-300 hover:border-blue-400 rounded-lg px-3 py-2 transition-all disabled:opacity-50"
                            >
                                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                {uploading ? 'Uploading...' : customExists ? 'Replace custom file' : 'Upload custom file (.xlsx)'}
                            </button>
                            {uploadDone && (
                                <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                                    <CheckCircle size={11} /> Custom file uploaded successfully
                                </p>
                            )}
                            {uploadError && (
                                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                    <AlertCircle size={11} /> {uploadError}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* File type selector */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Send Which File?</p>
                        <div className="flex gap-3">
                            <label className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all
                                ${fileType === 'generated'
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                                <input
                                    type="radio"
                                    name="fileType"
                                    value="generated"
                                    checked={fileType === 'generated'}
                                    onChange={() => setFileType('generated')}
                                    className="accent-blue-600"
                                />
                                <span className="text-sm font-medium">Generated</span>
                            </label>
                            <label className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all
                                ${!customExists ? 'opacity-40 cursor-not-allowed' : ''}
                                ${fileType === 'custom'
                                    ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                                <input
                                    type="radio"
                                    name="fileType"
                                    value="custom"
                                    checked={fileType === 'custom'}
                                    onChange={() => setFileType('custom')}
                                    disabled={!customExists}
                                    className="accent-yellow-600"
                                />
                                <span className="text-sm font-medium">Custom</span>
                                {!customExists && <span className="text-xs text-gray-400">(upload first)</span>}
                            </label>
                        </div>
                    </div>

                    {/* Send result */}
                    {sendResult && (
                        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                            <p className="font-semibold text-green-800">{sendResult.message}</p>
                            <p className="text-green-700 mt-0.5">Sent: <strong>{sendResult.total_sent}</strong> · Failed: <strong>{sendResult.failed}</strong></p>
                            {sendResult.errors?.length > 0 && sendResult.errors.map((e, i) => (
                                <p key={i} className="text-red-600 text-xs mt-1">{e.client}: {e.reason}</p>
                            ))}
                        </div>
                    )}
                    {sendError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                            <AlertCircle size={14} /> {sendError}
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={sending || !client.recipient_email || sendResult?.total_sent > 0}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {sending ? 'Sending...' : sendResult?.total_sent > 0 ? 'Sent ✓' : 'Send Email'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MISClientModal;
