import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api, getErrorMessage } from "../lib/api";

/** Non-blocking reminder shown while the logged-in user's email isn't verified yet. Never gates any functionality — see spec §2. */
export function VerificationBanner() {
  const { t } = useLanguage();
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setSending(true);
    setError(null);
    try {
      await api.post("/auth/resend-verification", {});
      setResent(true);
    } catch (err) {
      setError(getErrorMessage(err, t.auth.genericError));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-primary-tint px-6 py-2 text-sm text-text">
      <span>{t.auth.verificationBanner.message}</span>
      {resent ? (
        <span className="text-text-muted">{t.auth.verificationBanner.resent}</span>
      ) : (
        <div className="flex items-center gap-2">
          {error && <span className="text-primary">{error}</span>}
          <button type="button" onClick={handleResend} disabled={sending} className="text-primary underline disabled:opacity-50">
            {t.auth.verificationBanner.resend}
          </button>
        </div>
      )}
    </div>
  );
}
