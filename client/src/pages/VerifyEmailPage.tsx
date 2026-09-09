import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { api, getErrorMessage } from "../lib/api";
import { FormError } from "../components/FormError";
import type { User } from "../lib/types";

/**
 * Requires an explicit button click to consume the token — never fires on
 * page load — so a mail client's automatic link pre-fetch can't burn the
 * token before the user opens it themselves.
 */
export function VerifyEmailPage() {
  const { user, setUser } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus("confirming");
    setError(null);
    try {
      const updatedUser = await api.post<User>("/auth/verify-email", { token });
      // Only sync the auth context if the visitor already had a session — this
      // endpoint sets no cookie, so calling setUser without one would make the
      // app believe someone is logged in when no session actually exists (the
      // common real path is verifying from a browser where they're logged out).
      if (user) {
        setUser(updatedUser);
      }
      setStatus("done");
    } catch (err) {
      setError(getErrorMessage(err, t.auth.verifyEmail.invalidToken));
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.verifyEmail.title}</h2>
        {status === "done" ? (
          <p className="text-sm text-text">{t.auth.verifyEmail.success}</p>
        ) : (
          <>
            {error && <FormError message={error} />}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={status === "confirming"}
              className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
            >
              {status === "confirming" ? t.auth.verifyEmail.confirming : t.auth.verifyEmail.confirm}
            </button>
          </>
        )}
        <Link to="/dashboard" className="block text-sm text-primary underline">
          Inntena
        </Link>
      </div>
    </div>
  );
}
