import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Upload, FolderOpen, Mail, ShieldCheck, LogOut, User, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Import logo — place kiirus-logo.jpeg in src/assets/
import logo from '../assets/kiirus-logo.jpeg';

const Sidebar = () => {
    const { user, isAdmin, canWrite, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    const navItems = [
        ...(canWrite ? [{ name: 'Upload', path: '/upload', icon: Upload }] : []),
        { name: 'Files', path: '/files', icon: FolderOpen },
        { name: 'Email Logs', path: '/logs', icon: Mail },
        ...(isAdmin ? [
            { name: 'Admin', path: '/admin', icon: ShieldCheck },
            { name: 'Client Emails', path: '/admin/clients', icon: Users },
        ] : []),
    ];

    return (
        <aside className="w-64 bg-black border-r border-gray-800 h-screen fixed top-0 left-0 flex flex-col z-50">
            {/* Logo + Brand */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
                <img
                    src={logo}
                    alt="Kiirus Xpress"
                    className="h-10 w-auto object-contain"
                />
                <div>
                    <h1 className="font-bold text-[#d4a017] leading-tight text-sm">Kiirus Xpress</h1>
                    <p className="text-[11px] text-gray-400 font-medium">Order Automation</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 ${
                                isActive
                                    ? 'bg-[#d4a017] text-black'
                                    : 'text-gray-400 hover:bg-gray-900 hover:text-[#f2c94c] active:bg-gray-800'
                            }`
                        }
                    >
                        <item.icon size={18} />
                        {item.name}
                    </NavLink>
                ))}
            </nav>

            {/* User info + Logout */}
            <div className="p-4 border-t border-gray-800 space-y-2">
                {/* Current user card */}
                {user && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#1a1a1a]">
                        <div className="w-8 h-8 rounded-full bg-[#d4a017]/20 text-[#d4a017] flex items-center justify-center shrink-0">
                            <User size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-200 truncate">{user.email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[10px] font-bold px-1.5 py-px rounded ${
                                    user.role === 'admin' ? 'bg-purple-900/60 text-purple-300' : 'bg-blue-900/60 text-blue-300'
                                }`}>
                                    {user.role}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-px rounded ${
                                    user.permission === 'write' ? 'bg-orange-900/60 text-orange-300' : 'bg-gray-700 text-gray-400'
                                }`}>
                                    {user.permission}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-900 hover:text-red-400 transition-all"
                >
                    <LogOut size={16} />
                    Sign Out
                </button>

                <p className="text-xs text-gray-600 px-1">© 2026 Kiirus Xpress</p>
            </div>
        </aside>
    );
};

export default Sidebar;
