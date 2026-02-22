/**
 * AuthContext — global auth state.
 * Stores token + user in sessionStorage so the session ends when the tab/browser is closed.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => sessionStorage.getItem('token'));
    const [user, setUser] = useState(() => {
        try {
            const raw = sessionStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

    // On app load, validate the stored token against /auth/me.
    // If the token is expired or invalid, force logout.
    useEffect(() => {
        const storedToken = sessionStorage.getItem('token');
        if (!storedToken) return;
        getCurrentUser()
            .catch(() => {
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                setToken(null);
                setUser(null);
            });
    }, []);

    const login = (accessToken, userData) => {
        sessionStorage.setItem('token', accessToken);
        sessionStorage.setItem('user', JSON.stringify(userData));
        setToken(accessToken);
        setUser(userData);
    };

    const logout = () => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        setToken(null);
        setUser(null);
    };

    const isAuthenticated = Boolean(token && user);
    const isAdmin = user?.role === 'admin';
    const canWrite = user?.permission === 'write';

    return (
        <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated, isAdmin, canWrite }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
