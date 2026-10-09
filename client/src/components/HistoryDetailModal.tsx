import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { TrendChart } from "./TrendChart";
import { RelatedQueriesList } from "./RelatedQueriesList";
import { api } from "../lib/api";
import { useLanguage } from "../context/LanguageContext";
import type { Keyword, KeywordHistoryEntry, KeywordHistoryTrends, KeywordHistoryRelated } from "../lib/types";

interface HistoryDetailModalProps {
  entry: KeywordHistoryEntry;
  onClose: () => void;
  onRestored: (restored: Keyword) => void;
  onDeleted: (id: number) => void;
}

/** Detail view for one history entry: full multi-region trend chart, related queries, and — if archived — restore or permanently delete it. */
export function HistoryDetailModal({ entry, onClose, onRestored, onDeleted }: HistoryDetailModalProps) {
  const { t } = useLanguage();
  const [trends, setTrends] = useState<KeywordHistoryTrends | null>(null);
  const [related, setRelated] = useState<KeywordHistoryRelated | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<KeywordHistoryTrends>(`/keywords/${entry.id}/trends`),
      api.get<KeywordHistoryRelated>(`/keywords/${entry.id}/related`),
    ]).then(([trendsRes, relatedRes]) => {
      setTrends(trendsRes);
      setRelated(relatedRes);
    });
  }, [entry.id]);

  async function handleRestore() {
    setRestoring(true);
    try {
      const restored = await api.patch<Keyword>(`/keywords/${entry.id}/restore`, {});
      onRestored(restored);
    } finally {
      setRestoring(false);
    }
  }

  async function handleDeleteForever() {
    const confirmed = window.confirm(t.history.confirmDelete(entry.term));
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api.delete(`/keywords/${entry.id}/permanent`);
      onDeleted(entry.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={entry.term} onClose={onClose}>
      {!trends || !related ? (
        <p className="text-sm text-text-muted">{t.common.loading}</p>
      ) : (
        <div className="space-y-4">
          <div className="h-64">
            <TrendChart series={trends.series} />
          </div>
          <RelatedQueriesList columns={related.columns} />
          {entry.removedAt && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRestore}
                disabled={restoring || deleting}
                className="flex-1 rounded bg-primary-solid py-2 text-sm font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
              >
                {restoring ? t.history.restoring : t.history.restore}
              </button>
              <button
                type="button"
                onClick={handleDeleteForever}
                disabled={restoring || deleting}
                className="flex-1 rounded border border-border py-2 text-sm font-medium text-primary hover:bg-bg disabled:opacity-50"
              >
                {deleting ? t.history.deleting : t.history.deleteForever}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
