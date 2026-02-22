import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, Loader2, AlertCircle, Info } from 'lucide-react';
import { login as apiLogin } from '../api/authApi';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [infoMsg, setInfoMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfoMsg('');
        if (!email.trim() || !password.trim()) {
            setError('Email and password are required.');
            return;
        }
        setLoading(true);
        try {
            const data = await apiLogin(email.trim().toLowerCase(), password);

            // Server returned a plain message (new account created / rejected)
            if (data.message) {
                const msg = data.message.toLowerCase();
                if (msg.includes('pending')) {
                    // Save a minimal pending marker so PendingPage can show
                    sessionStorage.setItem('pendingEmail', email.trim().toLowerCase());
                    navigate('/pending', { replace: true });
                    return;
                }
                setInfoMsg(data.message);
                return;
            }

            // Full token response — active user
            login(data.access_token, data.user);
            navigate('/upload', { replace: true });
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(detail || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-br from-red-500 to-red-600 px-8 py-10 text-center">
                        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                            <Zap size={28} className="text-white" fill="currentColor" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Kiirus Xpress</h1>
                        <p className="text-red-100 text-sm mt-1">Order Automation Platform</p>
                    </div>

                    {/* Form */}
                    <div className="px-8 py-8">
                        <h2 className="text-xl font-semibold text-gray-800 mb-1">Welcome</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Enter your email to sign in or create an account.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Email */}
                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                                    Email address
                                </label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        required
                                        autoComplete="email"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        autoComplete="current-password"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                    <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            )}

                            {/* Info message (pending, etc.) */}
                            {infoMsg && (
                                <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                                    <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                                    <p className="text-sm text-blue-700">{infoMsg}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 mt-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Please wait…
                                    </>
                                ) : (
                                    'Continue'
                                )}
                            </button>
                        </form>

                        {/* Note */}
                        <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
                            New accounts require admin approval before access is granted.
                            <br />
                            The very first account automatically becomes admin.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
