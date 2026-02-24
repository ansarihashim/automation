import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye, Clock, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';

const FilesPage = () => {
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchBatches();
    }, []);

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const response = await api.get('/batches/');
            setBatches(response.data);
        } catch (err) {
            setError('Failed to load batches');
            console.error('Error fetching batches:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleBatchClick = (batchId) => {
        navigate(`/batches/${batchId}`);
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-gray-400">Loading batches...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-red-400">{error}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f0f0f] p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-[#d4a017] mb-2">File Batches</h1>
                    <p className="text-gray-400">View all uploaded batches and manage email sending</p>
                </div>

                {/* Batches List */}
                {batches.length === 0 ? (
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-12 text-center">
                        <FileText className="mx-auto h-16 w-16 text-gray-600 mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">No Batches Found</h3>
                        <p className="text-gray-400 mb-4">Upload a master file to create your first batch</p>
                        <button
                            onClick={() => navigate('/upload')}
                            className="px-4 py-2 bg-[#d4a017] text-black font-semibold rounded-lg hover:bg-[#f2c94c] transition-colors"
                        >
                            Upload File
                        </button>
                    </div>
                ) : (
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-[#d4a017]">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">
                                        Batch ID
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">
                                        Upload Time
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">
                                        Total Rows
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-[#1a1a1a] divide-y divide-gray-700">
                                {batches.map((batch) => (
                                    <tr 
                                        key={batch.batch_id}
                                        onClick={() => handleBatchClick(batch.batch_id)}
                                        className="hover:bg-gray-800 cursor-pointer transition-colors"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <FileText className="h-5 w-5 text-gray-500 mr-2" />
                                                <span className="text-sm font-medium text-gray-200">
                                                    {batch.batch_id}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center text-sm text-gray-400">
                                                <Clock className="h-4 w-4 mr-1" />
                                                {formatDate(batch.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm text-gray-200">{batch.total_rows}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="space-y-1">
                                                <div className="flex items-center text-sm">
                                                    <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                                                    <span className="text-green-400">{batch.sent_count} Sent</span>
                                                </div>
                                                <div className="flex items-center text-sm">
                                                    <XCircle className="h-4 w-4 text-red-500 mr-1" />
                                                    <span className="text-red-400">{batch.failed_count} Failed</span>
                                                </div>
                                                <div className="flex items-center text-sm">
                                                    <Clock className="h-4 w-4 text-gray-500 mr-1" />
                                                    <span className="text-gray-400">{batch.remaining_count} Remaining</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleBatchClick(batch.batch_id);
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#d4a017] text-black rounded-lg text-xs font-semibold hover:bg-[#f2c94c] transition-colors"
                                                title="View batch details"
                                            >
                                                <Eye className="h-3 w-3" />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FilesPage;
