import { useAuth } from '../context/AuthContext';

/**
 * Renders children only if the current user is an admin.
 *
 * Usage:
 *   <AdminOnly>
 *     <Link to="/admin">Admin Panel</Link>
 *   </AdminOnly>
 */
export default function AdminOnly({ children, fallback = null }) {
    const { isAdmin } = useAuth();
    return isAdmin ? children : fallback;
}
