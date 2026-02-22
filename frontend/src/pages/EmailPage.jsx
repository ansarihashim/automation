import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Mail, Send, Eye, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import api from '../services/api';
import EmailPreviewModal from '../components/EmailPreviewModal';
import WriteAccess from '../components/WriteAccess';

const EmailPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const batchId = searchParams.get('batch_id');
    
    const [batchData, setBatchData] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sending, setSending] = useState(false);
    const [previewModal, setPreviewModal] = useState({ open: false, row: null });

    const sendLimits = [1, 5, 10, 20, 50];

    useEffect(() => {
        if (!batchId) {
            setError('No batch ID provided');
            setLoading(false);
            return;
        }
        fetchBatchData();
    }, [batchId]);

    const fetchBatchData = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/batches/${batchId}`);
            setBatchData(response.data);
            setRows(response.data.rows || []);
        } catch (err) {
            setError('Failed to load batch data');
            console.error('Error fetching batch:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSendEmails = async (limit) => {
        // Confirmation message
        const confirmMessage = limit === 'all' 
            ? `Send emails to all ${stats.remaining} remaining recipients?`
            : `Send ${limit} emails from this batch?`;
        
        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            setSending(true);
            const response = await api.post('/email/send', {
                batch_id: batchId,
                limit: limit
            });

            // Display results
            const message = `Sent: ${response.data.sent}\nFailed: ${response.data.failed}\nRemaining: ${response.data.remaining}`;
            alert(message);
            
            // Refresh batch data
            await fetchBatchData();
        } catch (err) {
            console.error('Error sending emails:', err);
            alert('Failed to send emails');
        } finally {
            setSending(false);
        }
    };

    const handleCustomSend = () => {
        const limit = prompt('Enter number of emails to send:');
        if (limit && !isNaN(limit) && parseInt(limit) > 0) {
            handleSendEmails(parseInt(limit));
        }
    };

    const handlePreview = async (row) => {
        try {
            const response = await api.post('/email/preview', {
                batch_id: batchId,
                row_id: row.row_id
            });
            setPreviewModal({ open: true, data: response.data });
        } catch (err) {
            console.error('Error loading preview:', err);
            alert('Failed to load email preview');
        }
    };

    const handlePreviewFirst = async () => {
        try {
            const response = await api.get(`/email/preview-first/${batchId}`);
            setPreviewModal({ open: true, data: response.data });
        } catch (err) {
            console.error('Error loading preview:', err);
            alert('Failed to load email preview');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Sent':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Sent
                    </span>
                );
            case 'Failed':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                    </span>
                );
            case 'NotSent':
            default:
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Clock className="h-3 w-3 mr-1" />
                        Not Sent
                    </span>
                );
        }
    };

    const stats = {
        total: rows.length,
        sent: rows.filter(r => r.status === 'Sent').length,
        failed: rows.filter(r => r.status === 'Failed').length,
        remaining: rows.filter(r => r.status === 'NotSent').length
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-gray-500">Loading batch data...</div>
            </div>
        );
    }

    if (error || !batchData) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <div className="text-red-500 mb-4">{error || 'Batch not found'}</div>
                    <button
                        onClick={() => navigate('/files')}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                        Back to Files
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Email Management</h1>
                    <p className="text-gray-600">Batch: {batchId}</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-gray-500 mb-1">Total Rows</div>
                        <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-gray-500 mb-1">Sent</div>
                        <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-gray-500 mb-1">Failed</div>
                        <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-gray-500 mb-1">Remaining</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.remaining}</div>
                    </div>
                </div>

                {/* Control Panel */}
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Send Controls</h3>
                            <WriteAccess fallback={
                                <p className="text-sm text-gray-400 italic">Read-only access — email sending is disabled.</p>
                            }>
                                <div className="flex flex-wrap gap-2">
                                    {sendLimits.map(limit => (
                                        <button
                                            key={limit}
                                            onClick={() => handleSendEmails(limit)}
                                            disabled={sending || stats.remaining === 0}
                                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Send {limit}
                                        </button>
                                    ))}
                                    <button
                                        onClick={handleCustomSend}
                                        disabled={sending || stats.remaining === 0}
                                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Custom Amount
                                    </button>
                                    <button
                                        onClick={() => handleSendEmails('all')}
                                        disabled={sending || stats.remaining === 0}
                                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
                                    >
                                        Send All ({stats.remaining})
                                    </button>
                                </div>
                            </WriteAccess>
                        </div>
                        <div>
                            <button
                                onClick={handlePreviewFirst}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview First Email
                            </button>
                        </div>
                    </div>
                </div>

                {/* Customers Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Row ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Customer
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Email
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Details
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {rows.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-mono text-gray-900">
                                            #{row.row_id}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                            {row.customer_name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">
                                            {row.customer_email}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">
                                            {row.parcel_count} parcel(s)
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {row.total_weight} kg | {row.payment_status}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {getStatusBadge(row.status)}
                                        {row.error && (
                                            <div className="text-xs text-red-600 mt-1" title={row.error}>
                                                Error: {row.error.substring(0, 30)}...
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => handlePreview(row)}
                                            className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                                        >
                                            <Eye className="h-3 w-3 mr-1" />
                                            Preview
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Email Preview Modal */}
            {previewModal.open && (
                <EmailPreviewModal
                    isOpen={previewModal.open}
                    onClose={() => setPreviewModal({ open: false, data: null })}
                    emailData={previewModal.data}
                />
            )}
        </div>
    );
};

export default EmailPage;
