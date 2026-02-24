import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, Info, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { login as apiLogin } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/kiirus-logo.jpeg';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [infoMsg, setInfoMsg] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfoMsg('');
        if (!email.trim() || !password.trim()) {
            setError('Email and password are required.');
            return;
        }
        if (!email.includes('@')) {
            setError('Please enter a valid email address.');
            return;
        }
        setLoading(true);
        try {
            const data = await apiLogin(email.trim().toLowerCase(), password);

            // Server returned a plain message (new account created / rejected)
            if (data.message) {
                const msg = data.message.toLowerCase();
                if (msg.includes('pending')) {
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
            if (!err.response) {
                setError('Server is not reachable. Please try again later.');
            } else if (err.response.status === 401) {
                setError('Invalid email or password.');
            } else if (err.response.status === 403) {
                setError('Your account is pending admin approval.');
            } else if (err.response.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Login failed. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">
                    {/* Header strip */}
                    <div className="bg-[#d4a017] px-8 py-10 text-center">
                        <img
                            src={logo}
                            alt="Kiirus Xpress"
                            className="h-16 w-auto object-contain mx-auto mb-4"
                        />
                        <h1 className="text-2xl font-bold text-black">Kiirus Xpress</h1>
                        <p className="text-black/70 text-sm mt-1">Order Automation Platform</p>
                    </div>

                    {/* Form */}
                    <div className="px-8 py-8">
                        <h2 className="text-xl font-semibold text-white mb-1">Welcome back</h2>
                        <p className="text-sm text-gray-400 mb-6">
                            Enter your credentials to sign in.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Email */}
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-1.5">
                                    Email address
                                </label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        required
                                        autoComplete="email"
                                        className="w-full pl-10 pr-4 py-2.5 bg-[#0f0f0f] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-1.5">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        autoComplete="current-password"
                                        className="w-full pl-10 pr-10 py-2.5 bg-[#0f0f0f] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-[#d4a017] focus:border-[#d4a017] transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                        tabIndex={-1}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2.5 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3">
                                    <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-red-300">{error}</p>
                                </div>
                            )}

                            {/* Info message (pending, etc.) */}
                            {infoMsg && (
                                <div className="flex items-start gap-2.5 bg-blue-950/60 border border-blue-800 rounded-lg px-4 py-3">
                                    <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-blue-300">{infoMsg}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#d4a017] hover:bg-[#f2c94c] active:bg-[#b8880e] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 mt-2"
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
                        <p className="text-xs text-gray-600 text-center mt-6 leading-relaxed">
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
