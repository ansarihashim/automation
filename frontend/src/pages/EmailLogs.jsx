import React, { useEffect, useState } from 'react';
import { Search, Mail, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { getEmailLogs } from '../services/api';

const EmailLogs = () => {
    const [logs, setLogs] = useState([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        getEmailLogs().then(setLogs);
    }, []);

    const getStatusBadge = (status) => {
        const s = (status || '').toLowerCase();
        if (s === 'sent' || s === 'success') {
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100"><CheckCircle size={12} /> Sent</span>;
        } else if (s === 'failed') {
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100"><AlertCircle size={12} /> Failed</span>;
        } else if (s === 'scheduled') {
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"><Clock size={12} /> Scheduled</span>;
        }
        return <span className="text-gray-500 text-sm">{status}</span>;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold text-gray-900">Email Log</h1>
                <p className="text-gray-500 mt-1">Track all outgoing customer email communications</p>
            </div>

            {/* Search */}
            <div className="w-full md:w-96 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Search email logs..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all duration-150 ease-in-out"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Table Card */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-900 uppercase tracking-wide">Email / Batch</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-900 uppercase tracking-wide">Sent At</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-900 uppercase tracking-wide">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-900 uppercase tracking-wide">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                        No email logs found.
                                    </td>
                                </tr>
                            ) : (
                                logs
                                .filter(log => {
                                    const q = search.toLowerCase();
                                    return !q ||
                                        (log.email || '').toLowerCase().includes(q) ||
                                        (log.client_name || '').toLowerCase().includes(q) ||
                                        (log.batch_id || '').toLowerCase().includes(q) ||
                                        (log.status || '').toLowerCase().includes(q);
                                })
                                .map((log, index) => (
                                    <tr key={index} className="transition-colors duration-150 ease-in-out hover:bg-gray-50 cursor-default group">
                                        <td className="px-6 py-4">
                                            {log.client_name && <div className="font-medium text-sm text-gray-900">{log.client_name}</div>}
                                            <div className="text-sm text-gray-700">{log.email}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">Batch: {log.batch_id}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                                            {log.sent_at ? new Date(log.sent_at).toLocaleString() : '—'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(log.status)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {log.error ? (
                                                <span className="text-red-600 flex items-center gap-1">
                                                    <AlertCircle size={14} />
                                                    {log.error}
                                                </span>
                                            ) : (
                                                <span className="text-green-600">Avg. delivery time: &lt;1s</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default EmailLogs;
