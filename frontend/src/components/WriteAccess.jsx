import { useAuth } from '../context/AuthContext';

/**
 * Renders children only if the current user has write permission.
 * Read-only users see nothing.
 *
 * Usage:
 *   <WriteAccess>
 *     <button>Upload</button>
 *   </WriteAccess>
 */
export default function WriteAccess({ children, fallback = null }) {
    const { canWrite } = useAuth();
    return canWrite ? children : fallback;
}
