import { useState, type FormEvent } from "react";
import { api, getApiErrorCode, getApiErrorLimit, getErrorMessage } from "../lib/api";
import { useLanguage } from "../context/LanguageContext";
import type { Keyword } from "../lib/types";

interface KeywordFormProps {
  onCreated: () => void;
  /** Disables submission while the user is at the keyword cap. */
  limitReached?: boolean;
  /** Cap shown in the limit message when the backend response does not carry one. */
  maxKeywords?: number;
}

/** Form to create a new tracked keyword; calls onCreated() after a successful POST. */
export function KeywordForm({ onCreated, limitReached = false, maxKeywords }: KeywordFormProps) {
  const { t } = useLanguage();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post<Keyword>("/keywords", {
        term,
        ...(category.trim() ? { category: category.trim() } : {}),
      });
      setTerm("");
      setCategory("");
      onCreated();
    } catch (err) {
      if (getApiErrorCode(err) === "KEYWORD_LIMIT_REACHED") {
        setError(t.keywordList.limitReached(getApiErrorLimit(err) ?? maxKeywords ?? 0));
      } else {
        setError(getErrorMessage(err, t.auth.genericError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div>
        <label className="block text-xs font-medium text-text" htmlFor="term">{t.keywordForm.keywordLabel}</label>
        <input
          id="term"
          required
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="mt-1 rounded border border-border bg-bg px-3 py-1.5 text-sm text-text"
          placeholder={t.keywordForm.keywordPlaceholder}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text" htmlFor="category">{t.keywordForm.categoryLabel}</label>
        <input
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 rounded border border-border bg-bg px-3 py-1.5 text-sm text-text"
          placeholder={t.keywordForm.categoryPlaceholder}
        />
      </div>
      <button
        type="submit"
        disabled={submitting || limitReached}
        className="rounded bg-primary-solid px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
      >
        {submitting ? t.keywordForm.submitting : t.keywordForm.submit}
      </button>
      {error && <p className="w-full text-sm text-primary">{error}</p>}
    </form>
  );
}
