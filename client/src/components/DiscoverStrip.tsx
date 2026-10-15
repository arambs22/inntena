import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api, getApiErrorCode, getApiErrorLimit, getErrorMessage } from "../lib/api";
import { describeOrigin, loadDiscoverOpen, saveDiscoverOpen } from "../lib/discover";
import { growthLocale } from "../lib/growth";
import { formatCount } from "../lib/opportunity";
import type { DiscoverSuggestion } from "../lib/types";

interface DiscoverStripProps {
  suggestions: DiscoverSuggestion[] | null;
  /** Called after a suggestion was added to the user's keywords. */
  onTracked: () => void;
}

/** Collapsible strip of up to five keyword suggestions with a one-click "Track". */
export function DiscoverStrip({ suggestions, onTracked }: DiscoverStripProps) {
  const { t, language } = useLanguage();
  const locale = growthLocale(language);
  const [open, setOpen] = useState(loadDiscoverOpen);
  const [busyTerm, setBusyTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setOpen((current) => {
      saveDiscoverOpen(!current);
      return !current;
    });
  }

  async function track(term: string) {
    setBusyTerm(term);
    setError(null);
    try {
      await api.post("/keywords", { term });
      onTracked();
    } catch (err) {
      const limit = getApiErrorLimit(err);
      setError(getApiErrorCode(err) === "KEYWORD_LIMIT_REACHED" && limit !== null ? t.keywordList.limitReached(limit) : getErrorMessage(err, t.auth.genericError));
    } finally {
      setBusyTerm(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface px-5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t.discover.title}</h2>
          {open && <p className="text-xs text-text-muted">{t.discover.caveat}</p>}
        </div>
        <button type="button" onClick={toggle} aria-expanded={open} className="text-xs text-primary underline">
          {open ? t.discover.hide : t.discover.show}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          {error && <p className="mb-2 text-xs text-primary">{error}</p>}
          {suggestions && suggestions.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {suggestions.map((suggestion) => (
                <li key={suggestion.term} className="flex flex-col justify-between gap-2 rounded border border-border bg-bg p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text" title={suggestion.term}>{suggestion.term}</p>
                    <p className="text-xs text-text-muted">
                      {suggestion.origin.type === "related" && suggestion.origin.breakout && (
                        <span className="font-mono font-semibold uppercase text-rise">{t.discover.breakout} · </span>
                      )}
                      {describeOrigin(suggestion.origin, t)}
                    </p>
                    {suggestion.supply && (
                      <p className="text-xs text-text-muted">
                        {suggestion.supply.count !== null
                          ? `${t.supply.supplyTitle}: ${t.supply.listings(formatCount(suggestion.supply.count, locale))}`
                          : t.discover.supplyUnknown}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyTerm !== null}
                    onClick={() => void track(suggestion.term)}
                    className="self-start rounded bg-primary-solid px-3 py-1 text-xs font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
                  >
                    {busyTerm === suggestion.term ? t.discover.tracking : t.discover.track}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{t.discover.empty}</p>
          )}
        </div>
      )}
    </section>
  );
}
