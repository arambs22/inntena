import type { ReactNode } from "react";
import { useLanguage } from "../context/LanguageContext";
import { growthLocale } from "../lib/growth";
import type { KeywordInsight } from "../lib/keywordInsights";
import { regionLabel } from "../lib/i18n";
import { SUPPLY_HIGH_ABOVE, SUPPLY_LOW_BELOW, formatCount } from "../lib/opportunity";
import { InfoTip } from "./InfoTip";
import { VerdictBadge } from "./VerdictBadge";

const MS_PER_HOUR = 3_600_000;
const MOMENTUM_ARROW = { rising: "▲", steady: "→", cooling: "▼" } as const;

interface BlockProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

function Block({ title, action, children }: BlockProps) {
  return (
    <div className="min-w-0 rounded border border-border bg-bg px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-xs uppercase tracking-wider text-text-muted">{title}</p>
        {action}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

interface SupplyStripProps {
  insight: KeywordInsight;
  /** Display name of the region the demand figure refers to. */
  regionName: string;
  /** Optional control rendered in the demand block, e.g. the demand-region selector. */
  demandControl?: ReactNode;
  /** Optional control in the supply block, e.g. the Etsy category select. */
  categoryControl?: ReactNode;
}

/** Demand / supply / verdict summary for the selected keyword, shown above the chart when Etsy data is enabled. */
export function SupplyStrip({ insight, regionName, demandControl, categoryControl }: SupplyStripProps) {
  const { t, language } = useLanguage();
  const locale = growthLocale(language);
  const { supply } = insight;

  const demand =
    insight.momentum === "unknown" ? (
      <p className="text-sm text-text-muted">{t.supply.momentum.unknown}</p>
    ) : (
      <>
        <p className="font-mono text-lg font-semibold text-text">
          <span aria-hidden>{MOMENTUM_ARROW[insight.momentum]} </span>
          {insight.changePct !== null
            ? `${insight.changePct >= 0 ? "+" : "−"}${Math.abs(Math.round(insight.changePct))}%`
            : t.supply.momentum[insight.momentum]}
        </p>
        <p className="text-xs text-text-muted">
          {t.supply.demandIn(regionName)} · {t.supply.last14Days}
        </p>
      </>
    );

  let supplyView: ReactNode;
  if (supply === null) {
    supplyView = <p className="text-sm text-text-muted">{t.supply.noData}</p>;
  } else if (supply.count !== null) {
    // `!== null`, never a truthiness test: a count of 0 is real data.
    const hours = supply.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(supply.fetchedAt)) / MS_PER_HOUR)) : 0;
    supplyView = (
      <>
        <p className="font-mono text-lg font-semibold text-text">{supply.count.toLocaleString(locale)}</p>
        <p className="text-xs text-text-muted">
          {t.supply.updatedAgo(hours)} · {t.supply.sourceEtsy}
        </p>
        {supply.local && supply.local.count !== null && (
          <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
            {t.etsy.localSupply(supply.local.count.toLocaleString(locale), regionLabel(t, supply.local.region))}
            <InfoTip label={t.etsy.localHelp}>
              <p>{t.etsy.localHelp}</p>
            </InfoTip>
          </p>
        )}
      </>
    );
  } else {
    supplyView = (
      <p className="text-sm text-text-muted">{supply.status === "refreshing" ? t.supply.checking : t.supply.unavailable}</p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Block title={t.supply.demandTitle} action={demandControl}>{demand}</Block>
      <Block title={t.supply.supplyTitle} action={categoryControl}>{supplyView}</Block>
      <Block
        title={t.supply.verdictTitle}
        action={
          <InfoTip label={t.supply.helpLabel}>
            <p>{t.supply.helpDemand}</p>
            <p>{t.supply.helpSupply(formatCount(SUPPLY_LOW_BELOW, locale), formatCount(SUPPLY_HIGH_ABOVE, locale))}</p>
            <p>{t.supply.helpVerdict}</p>
            <p className="font-medium text-text">{t.supply.helpCaveat}</p>
          </InfoTip>
        }
      >
        {insight.verdict ? (
          <>
            <VerdictBadge verdict={insight.verdict} size="md" />
            <p className="mt-1 text-xs text-text-muted">{t.supply.verdictSentences[insight.verdict]}</p>
          </>
        ) : (
          <p className="text-sm text-text-muted">{t.supply.noData}</p>
        )}
      </Block>
    </div>
  );
}
