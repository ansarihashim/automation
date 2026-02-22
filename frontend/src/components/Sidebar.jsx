import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Upload, FolderOpen, Mail, Zap, ShieldCheck, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
        ...(isAdmin ? [{ name: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
    ];

    return (
        <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed top-0 left-0 flex flex-col z-50">
            {/* Sidebar Header */}
            <div className="h-20 flex items-center px-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                        <Zap size={20} fill="currentColor" />
                    </div>
                    <div>
                        <h1 className="font-bold text-gray-900 leading-tight">Kiirus Xpress</h1>
                        <p className="text-xs text-gray-500 font-medium">Order Automation</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${isActive
                                ? 'bg-red-50 text-red-600'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
                            }`
                        }
                    >
                        <item.icon size={18} />
                        {item.name}
                    </NavLink>
                ))}
            </nav>

            {/* User info + Logout */}
            <div className="p-4 border-t border-gray-100 space-y-2">
                {/* Current user card */}
                {user && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                            <User size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 truncate">{user.email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[10px] font-bold px-1.5 py-px rounded ${
                                    user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                                }`}>
                                    {user.role}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-px rounded ${
                                    user.permission === 'write' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
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
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
                >
                    <LogOut size={16} />
                    Sign Out
                </button>

                <p className="text-xs text-gray-400 px-1">© 2026 Kiirus Xpress</p>
            </div>
        </aside>
    );
};

export default Sidebar;
