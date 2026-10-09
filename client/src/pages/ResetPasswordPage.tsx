import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getErrorMessage } from "../lib/api";
import { AuthPageShell } from "../components/AuthPageShell";
import { FormError } from "../components/FormError";

/** Reads the reset token from the URL; submitting the form is the explicit user action that consumes it (never the page's own GET). */
export function ResetPasswordPage() {
  const { completePasswordReset } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t.auth.resetPassword.mismatch);
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordReset(token, newPassword);
      navigate("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, t.auth.resetPassword.invalidToken));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageShell>
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.resetPassword.title}</h2>
        {error && <FormError message={error} />}
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="newPassword">{t.auth.resetPassword.newPassword}</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="confirmPassword">{t.auth.resetPassword.confirmPassword}</label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-primary-solid py-2 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
        >
          {submitting ? t.auth.resetPassword.submitting : t.auth.resetPassword.submit}
        </button>
        <p className="text-center text-sm text-text-muted">
          <Link to="/login" className="text-primary underline">{t.auth.forgotPassword.backToLogin}</Link>
        </p>
      </form>
    </AuthPageShell>
  );
}
