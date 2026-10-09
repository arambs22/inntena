import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";
import { filterKeywords } from "../lib/keywordListView";
import type { KeywordHistoryEntry } from "../lib/types";
import { Modal } from "./Modal";
import { HistoryDetailModal } from "./HistoryDetailModal";

const RETENTION_OPTIONS = [15, 30, 60, 90];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// "" is a real region code (Worldwide), so the "no filter" option needs its own sentinel to stay distinguishable from it.
const ALL_REGIONS_FILTER = "__all__";

interface HistoryModalProps {
  initialRetentionDays: number;
  onClose: () => void;
}

function daysRemaining(removedAt: string, retentionDays: number): number {
  const deadlineMs = new Date(removedAt).getTime() + retentionDays * MS_PER_DAY;
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / MS_PER_DAY));
}

/** Modal listing every keyword the user has ever tracked, active or archived, filterable by region. */
export function HistoryModal({ initialRetentionDays, onClose }: HistoryModalProps) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<KeywordHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState(ALL_REGIONS_FILTER);
  const [retentionDays, setRetentionDays] = useState(initialRetentionDays);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .get<KeywordHistoryEntry[]>("/keywords?includeRemoved=true")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  async function handleRetentionChange(days: number) {
    setRetentionDays(days);
    await api.patch("/auth/me", { historyRetentionDays: days });
  }

  const allRegions = Array.from(new Set(entries.flatMap((e) => e.regions)));
  const regionFiltered =
    regionFilter === ALL_REGIONS_FILTER ? entries : entries.filter((e) => e.regions.includes(regionFilter));
  const filtered = filterKeywords(regionFiltered, query);
  const detailEntry = entries.find((e) => e.id === detailId) ?? null;

  return (
    <>
      <Modal title={t.history.title} onClose={onClose}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t.history.retention}</span>
          <select
            value={retentionDays}
            onChange={(e) => handleRetentionChange(Number(e.target.value))}
            className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
          >
            {RETENTION_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {t.history.days(days)}
              </option>
            ))}
          </select>
        </div>
        {allRegions.length > 0 && (
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="mb-3 w-full rounded border border-border bg-bg px-2 py-1 text-xs text-text"
          >
            <option value={ALL_REGIONS_FILTER}>{t.history.allRegions}</option>
            {allRegions.map((code) => (
              <option key={code} value={code}>
                {regionLabel(t, code)}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.history.searchPlaceholder}
          aria-label={t.history.searchAria}
          className="mb-3 w-full rounded border border-border bg-bg px-3 py-1.5 text-sm text-text"
        />
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-text-muted">{t.common.loading}</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-text-muted">
              {query.trim() !== "" && regionFiltered.length > 0 ? t.history.noMatches(query.trim()) : t.history.empty}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(entry.id)}
                    className="w-full min-w-0 rounded border border-border bg-bg px-2 py-1.5 text-left hover:border-primary"
                  >
                    <p className="truncate text-sm text-text" title={entry.term}>
                      {entry.term}
                    </p>
                    <p className="text-xs text-text-muted">
                      {entry.removedAt ? t.history.archivedExpires(daysRemaining(entry.removedAt, retentionDays)) : t.history.active}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
      {detailEntry && (
        <HistoryDetailModal
          entry={detailEntry}
          onClose={() => setDetailId(null)}
          onRestored={(restored) => {
            setEntries((prev) =>
              prev.map((e) => (e.id === restored.id ? { ...e, removedAt: restored.removedAt } : e))
            );
            setDetailId(null);
          }}
          onDeleted={(id) => {
            setEntries((prev) => prev.filter((e) => e.id !== id));
            setDetailId(null);
          }}
        />
      )}
    </>
  );
}
