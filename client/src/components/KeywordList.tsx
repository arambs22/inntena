import { useRef, useState } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";
import type { Keyword } from "../lib/types";

interface KeywordListProps {
  keywords: Keyword[];
  activeRegions: string[];
  onChanged: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Active search query; used only to tell "no keywords at all" apart from "no keyword matches". */
  query?: string;
}

function getBlockedRegions(keyword: Keyword, activeRegions: string[]): string[] {
  if (!keyword.collectionStatus) return [];
  return activeRegions.filter((geo) => keyword.collectionStatus?.[geo]?.blocked);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

interface BlockedIndicatorProps {
  keyword: Keyword;
  blockedRegions: string[];
}

/**
 * Hover-revealed bubble explaining the blocked warning icon: what it means, plus a per-region
 * breakdown of the failures behind it. Positioned with `fixed` coordinates computed from the
 * trigger's bounding rect on hover/focus, rather than `absolute` inside the list — the keyword
 * list scrolls (`overflow-y-auto`), which would otherwise clip the bubble.
 */
function BlockedIndicator({ keyword, blockedRegions }: BlockedIndicatorProps) {
  const { t } = useLanguage();
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 10, left: rect.left });
  }
  function hide() {
    setAnchor(null);
  }

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        role="img"
        aria-label={t.blocked.ariaLabel}
        className="shrink-0 cursor-default text-primary outline-none"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        ⚠
      </span>
      {anchor && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-72 origin-top-left animate-[blocked-tooltip-in_150ms_ease-out]"
          style={{ top: anchor.top, left: anchor.left }}
        >
          <span className="absolute -top-1.5 left-3 h-3 w-3 rotate-45 border-l border-t border-border bg-surface" />
          <div className="relative rounded-lg border border-border bg-surface p-3.5 text-xs shadow-lg">
            <p className="font-display text-sm font-semibold text-text">{t.blocked.title}</p>
            <p className="mt-1 leading-relaxed text-text-muted">{t.blocked.explanation}</p>
            <ul className="mt-2.5 space-y-2 border-t border-border pt-2.5">
              {blockedRegions.map((geo) => {
                const status = keyword.collectionStatus?.[geo];
                return (
                  <li key={geo}>
                    <p className="font-medium text-text">{regionLabel(t, geo)}</p>
                    {status && (
                      <p className="text-text-muted">
                        {t.blocked.lastAttempt(formatTimestamp(status.lastAttemptAt))} —{" "}
                        {t.blocked.failedAttempts(status.consecutiveFailures)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/** Lists the user's tracked keywords; click to select, pin, pause/resume automatic collection, or archive individually. */
export function KeywordList({ keywords, activeRegions, onChanged, selectedId, onSelect, query = "" }: KeywordListProps) {
  const { t } = useLanguage();

  async function handleTogglePin(id: number, currentlyPinned: boolean) {
    await api.patch(`/keywords/${id}/pin`, { pinned: !currentlyPinned });
    onChanged();
  }

  async function handleDelete(id: number) {
    await api.delete(`/keywords/${id}`);
    onChanged();
  }

  async function handleTogglePause(id: number, currentlyPaused: boolean) {
    await api.patch(`/keywords/${id}/auto-collect`, { paused: !currentlyPaused });
    onChanged();
  }

  if (keywords.length === 0) {
    const message = query.trim() !== "" ? t.keywordList.noMatches(query.trim()) : t.keywordList.empty;
    return <p className="text-sm text-text-muted">{message}</p>;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      {keywords.map((keyword) => {
        const blockedRegions = getBlockedRegions(keyword, activeRegions);
        return (
          <li
            key={keyword.id}
            onClick={() => onSelect(keyword.id)}
            className={`flex cursor-pointer items-center justify-between gap-2 px-4 py-3 ${
              selectedId === keyword.id ? "bg-bg" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              {keyword.pinnedAt !== null && (
                <svg
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="currentColor"
                  aria-hidden="true"
                  className="shrink-0 text-primary"
                >
                  <path d="M9.5 1.5l5 5-1.6.6-2.4 2.4.3 3.2-1.1 1.1-2.8-2.8-4.2 4.2-.7-.7 4.2-4.2-2.8-2.8 1.1-1.1 3.2.3 2.4-2.4z" />
                </svg>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text" title={keyword.term}>
                  {keyword.term}
                </p>
                <p className="text-xs text-text-muted">{keyword.category}</p>
              </div>
              {blockedRegions.length > 0 && <BlockedIndicator keyword={keyword} blockedRegions={blockedRegions} />}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin(keyword.id, keyword.pinnedAt !== null);
                }}
                className="text-text-muted hover:underline"
              >
                {keyword.pinnedAt !== null ? t.keywordList.unpin : t.keywordList.pin}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePause(keyword.id, keyword.autoCollectPaused);
                }}
                className="text-text-muted hover:underline"
              >
                {keyword.autoCollectPaused ? t.keywordList.resume : t.keywordList.pause}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(keyword.id);
                }}
                className="text-primary hover:underline"
              >
                {t.keywordList.archive}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
