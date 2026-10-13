import { useState } from "react";
import type { RelatedQuery } from "../lib/types";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";
import { formatGrowth, growthLocale } from "../lib/growth";
import { InfoTip } from "./InfoTip";
import { Modal } from "./Modal";

export interface RegionRelated {
  region: string;
  rising: RelatedQuery[];
}

interface RelatedQueriesListProps {
  columns: RegionRelated[];
}

const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

const VISIBLE_LIMIT = 5;

/** A rising query's growth as readable text (`+250%`), or a breakout marker for the very large ones. */
function GrowthValue({ raw }: { raw: string }) {
  const { t, language } = useLanguage();
  const label = formatGrowth(raw, growthLocale(language));

  if (label.kind === "breakout") {
    return <span className="font-mono text-xs font-semibold uppercase tracking-wide text-rise">{t.relatedQueries.breakout}</span>;
  }
  return <span className="font-mono font-medium text-rise">{label.text}</span>;
}

function QueryRow({ item }: { item: RelatedQuery }) {
  return (
    <li className="flex justify-between gap-3 text-sm">
      <span className="min-w-0 text-text">{item.query}</span>
      <span className="shrink-0">
        <GrowthValue raw={item.growthValue} />
      </span>
    </li>
  );
}

interface ColumnHeaderProps {
  /** Shows the "?" explanation next to the growth label; only one per screen is needed. */
  withHelp?: boolean;
}

/** Labels the two columns of a list, so the numbers on the right are never unexplained. */
function ColumnHeader({ withHelp = false }: ColumnHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="mb-1 flex items-center justify-between gap-3 text-xs uppercase tracking-wider text-text-muted">
      <span>{t.relatedQueries.queryHeader}</span>
      <span className="flex items-center gap-1.5">
        {t.relatedQueries.growthHeader}
        {withHelp && (
          <InfoTip label={t.relatedQueries.helpLabel}>
            <p>{t.relatedQueries.helpGrowth}</p>
            <p>{t.relatedQueries.helpBreakout}</p>
            <p className="font-medium text-text">{t.relatedQueries.helpCaveat}</p>
          </InfoTip>
        )}
      </span>
    </div>
  );
}

/** Lists a keyword's rising related search queries, one column per active region, truncated with a "view all" modal. */
export function RelatedQueriesList({ columns }: RelatedQueriesListProps) {
  const { t } = useLanguage();
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  const hasAny = columns.some((c) => c.rising.length > 0);
  if (!hasAny) {
    return <p className="text-sm text-text-muted">{t.relatedQueries.empty}</p>;
  }

  const expanded = columns.find((c) => c.region === expandedRegion) ?? null;

  return (
    <>
      <div className={`grid gap-4 ${GRID_COLS_CLASS[columns.length] ?? "grid-cols-1"}`}>
        {columns.map(({ region, rising }, index) => (
          <div key={region}>
            {columns.length > 1 && (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {regionLabel(t, region)}
              </p>
            )}
            {rising.length === 0 ? (
              <p className="text-sm text-text-muted">{t.relatedQueries.noDataForColumn}</p>
            ) : (
              <>
                <ColumnHeader withHelp={index === 0} />
                <ul className="space-y-1">
                  {rising.slice(0, VISIBLE_LIMIT).map((item) => (
                    <QueryRow key={item.query} item={item} />
                  ))}
                </ul>
                {rising.length > VISIBLE_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setExpandedRegion(region)}
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t.relatedQueries.viewAll(rising.length - VISIBLE_LIMIT)}
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {expanded && (
        <Modal title={t.relatedQueries.modalTitle(regionLabel(t, expanded.region))} onClose={() => setExpandedRegion(null)}>
          <ColumnHeader withHelp />
          <ul className="space-y-1">
            {expanded.rising.map((item) => (
              <QueryRow key={item.query} item={item} />
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
