import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getErrorMessage } from "../lib/api";
import { AuthPageShell } from "../components/AuthPageShell";
import { FormError } from "../components/FormError";

/** Email/password registration form; on success redirects to /dashboard. */
export function RegisterPage() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!accepted) {
      setError(t.authTerms.mustAccept);
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, accepted);
      navigate("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, t.auth.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageShell>
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.register.title}</h2>
        {error && <FormError message={error} />}
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="email">{t.auth.register.email}</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="password">{t.auth.register.password}</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
          <p className="mt-1 text-xs text-text-muted">{t.auth.register.passwordHint}</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            aria-required="true"
            className="mt-0.5"
          />
          <span>
            {t.authTerms.acceptPrefix}{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">{t.authTerms.termsLink}</a>{" "}
            {t.authTerms.and}{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">{t.authTerms.privacyLink}</a>
          </span>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-primary-solid py-2 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
        >
          {submitting ? t.auth.register.submitting : t.auth.register.submit}
        </button>
        <p className="text-center text-sm text-text-muted">
          {t.auth.register.haveAccount} <Link to="/login" className="text-primary underline">{t.auth.register.loginLink}</Link>
        </p>
      </form>
    </AuthPageShell>
  );
}
