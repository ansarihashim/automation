import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a route and redirects to /login if not authenticated.
 * If adminOnly=true, also redirects non-admins to /upload.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
    const { isAuthenticated, isAdmin } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && !isAdmin) {
        return <Navigate to="/upload" replace />;
    }

    return children;
}
