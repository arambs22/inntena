import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

/** Renders nested routes only for a logged-in user; otherwise redirects to /login. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return <p className="p-6 text-text-muted">{t.common.loading}</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
