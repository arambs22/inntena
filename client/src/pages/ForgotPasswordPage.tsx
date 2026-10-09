import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { api, getErrorMessage } from "../lib/api";
import { AuthPageShell } from "../components/AuthPageShell";
import { FormError } from "../components/FormError";

/** Requests a password-reset email. Always shows the same success message, whether or not the email is registered. */
export function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/request-password-reset", { email });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err, t.auth.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageShell>
      <div className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.forgotPassword.title}</h2>
        {error && <FormError message={error} />}
        {sent ? (
          <p className="rounded border border-border bg-bg p-2 text-sm text-text">{t.auth.forgotPassword.success}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="email">{t.auth.forgotPassword.email}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-primary-solid py-2 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
            >
              {submitting ? t.auth.forgotPassword.submitting : t.auth.forgotPassword.submit}
            </button>
          </form>
        )}
        <p className="text-center text-sm text-text-muted">
          <Link to="/login" className="text-primary underline">{t.auth.forgotPassword.backToLogin}</Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
