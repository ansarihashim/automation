import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, LogOut } from 'lucide-react';
import { getCurrentUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';

export default function PendingPage() {
    const navigate = useNavigate();
    const { login, logout } = useAuth();
    const intervalRef = useRef(null);

    const checkStatus = async () => {
        try {
            const user = await getCurrentUser();
            // getCurrentUser returns the token payload — we need full user status
            // So we re-call login flow via /auth/me; if active the token still works
            // and role/permission are present — we treat as active
            if (user?.role && user?.email) {
                // User is active (pending users can't pass the auth middleware)
                navigate('/upload', { replace: true });
            }
        } catch {
            // Still pending (401) or network error — stay on page
        }
    };

    useEffect(() => {
        checkStatus();
        intervalRef.current = setInterval(checkStatus, 30000);
        return () => clearInterval(intervalRef.current);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    const handleRefresh = () => {
        checkStatus();
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center space-y-6">
                    {/* Icon */}
                    <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto">
                        <Clock size={28} className="text-amber-500" />
                    </div>

                    {/* Text */}
                    <div className="space-y-2">
                        <h1 className="text-xl font-bold text-gray-900">Approval Pending</h1>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            Your access request is pending admin approval.
                            <br />
                            You'll be redirected automatically once approved.
                        </p>
                    </div>

                    {/* Auto-refresh note */}
                    <p className="text-xs text-gray-400">Checking status every 30 seconds…</p>

                    {/* Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleRefresh}
                            className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-all"
                        >
                            <RefreshCw size={14} />
                            Refresh Status
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 text-sm font-medium py-2.5 rounded-lg hover:bg-red-50 transition-all"
                        >
                            <LogOut size={14} />
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
