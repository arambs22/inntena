import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getErrorMessage } from "../lib/api";
import { FormError } from "./FormError";

/**
 * Blocking dialog shown to a logged-in user who has not accepted the current Terms of Use and Privacy Policy.
 * It has no close button and ignores Escape and backdrop clicks: the only ways out are accepting or logging out.
 */
export function TermsAcceptanceModal() {
  const { t } = useLanguage();
  const { acceptTerms, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!checked) return;
    setSaving(true);
    setError(null);
    try {
      await acceptTerms();
    } catch (err) {
      setError(getErrorMessage(err, t.auth.genericError));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl"
      >
        <h2 id="terms-gate-title" className="font-display text-xl font-semibold text-text">
          {t.termsGate.title}
        </h2>
        <p className="mt-2 text-sm text-text-muted">{t.termsGate.intro}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
          <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">
            {t.footer.terms}
          </a>
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
            {t.footer.privacy}
          </a>
        </p>
        {error && (
          <div className="mt-3">
            <FormError message={error} />
          </div>
        )}
        <label className="mt-4 flex items-start gap-2 text-sm text-text">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5" />
          <span>{t.termsGate.checkbox}</span>
        </label>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={!checked || saving}
            className="flex-1 rounded bg-primary-solid py-2 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
          >
            {saving ? t.termsGate.accepting : t.termsGate.accept}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded border border-border px-3 py-2 text-sm text-text-muted hover:text-text"
          >
            {t.termsGate.logout}
          </button>
        </div>
      </div>
    </div>
  );
}
