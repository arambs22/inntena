import { useLanguage } from "../context/LanguageContext";
import { SORT_MODES, type SortMode } from "../lib/keywordListView";

interface KeywordListToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
}

/** Search box and sort selector for the keyword list. Fully controlled by its parent. */
export function KeywordListToolbar({ query, onQueryChange, sortMode, onSortModeChange }: KeywordListToolbarProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t.keywordList.searchPlaceholder}
          aria-label={t.keywordList.searchAria}
          className="w-full rounded border border-border bg-bg py-1.5 pl-3 pr-8 text-sm text-text"
        />
        {query !== "" && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={t.keywordList.clearSearch}
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:text-text"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        )}
      </div>
      <select
        value={sortMode}
        onChange={(e) => onSortModeChange(e.target.value as SortMode)}
        aria-label={t.keywordList.sortLabel}
        className="shrink-0 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text"
      >
        {SORT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {t.keywordList.sortOptions[mode]}
          </option>
        ))}
      </select>
    </div>
  );
}
