import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api, getApiErrorCode, getApiErrorLimit, getErrorMessage } from "../lib/api";
import { DISCOVER_PAGE_SIZE, clampPage, describeOrigin, loadDiscoverOpen, loadDiscoverPage, nextPage, pageOf, saveDiscoverOpen, saveDiscoverPage } from "../lib/discover";
import { growthLocale } from "../lib/growth";
import { formatCount } from "../lib/opportunity";
import type { DiscoverSuggestion } from "../lib/types";

interface DiscoverStripProps {
  suggestions: DiscoverSuggestion[];
  /** True while the server is still verifying more terms with Etsy. */
  checking: boolean;
  /** Called after a suggestion was added to the user's keywords. */
  onTracked: () => void;
}

/** Collapsible panel showing five keyword suggestions at a time (paged), each with a one-click "Track". */
export function DiscoverStrip({ suggestions, checking, onTracked }: DiscoverStripProps) {
  const { t, language } = useLanguage();
  const locale = growthLocale(language);
  const [open, setOpen] = useState(loadDiscoverOpen);
  const [busyTerm, setBusyTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(loadDiscoverPage);
  const currentPage = clampPage(page, suggestions.length);
  const visible = pageOf(suggestions, currentPage);

  function showMore() {
    const next = nextPage(currentPage, suggestions.length);
    setPage(next);
    saveDiscoverPage(next);
  }

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
          {visible.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
              {visible.map((suggestion) => (
                <li key={suggestion.term} className="flex min-w-0 flex-col justify-between gap-2 rounded border border-border bg-bg p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text" title={suggestion.term}>{suggestion.term}</p>
                    <p className="truncate text-xs text-text-muted" title={describeOrigin(suggestion.origin, t, locale)}>
                      {describeOrigin(suggestion.origin, t, locale)}
                    </p>
                    {suggestion.supply && suggestion.supply.count !== null && (
                      <p className="truncate text-xs text-text-muted">{t.discover.listingsOnEtsy(formatCount(suggestion.supply.count, locale))}</p>
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
          ) : checking ? (
            <p className="text-sm text-text-muted">{t.discover.lookingForMore}</p>
          ) : (
            <p className="text-sm text-text-muted">{t.discover.empty}</p>
          )}
          {(suggestions.length > DISCOVER_PAGE_SIZE || (checking && visible.length > 0 && visible.length < DISCOVER_PAGE_SIZE)) && (
            <div className="mt-3 flex items-center gap-3">
              {suggestions.length > DISCOVER_PAGE_SIZE && (
                <button type="button" onClick={showMore} className="text-xs text-primary underline">
                  {t.discover.moreIdeas}
                </button>
              )}
              {checking && visible.length < DISCOVER_PAGE_SIZE && <p className="text-xs text-text-muted">{t.discover.lookingForMore}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
