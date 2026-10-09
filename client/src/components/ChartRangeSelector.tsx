import { useLanguage } from "../context/LanguageContext";
import { CHART_RANGES, type ChartRange } from "../lib/trendChart";

interface ChartRangeSelectorProps {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}

/** Pill group for choosing how many days of the trend chart are plotted. */
export function ChartRangeSelector({ value, onChange }: ChartRangeSelectorProps) {
  const { t } = useLanguage();

  return (
    <div role="group" aria-label={t.dashboard.chartRangeAria} className="flex items-center gap-1">
      {CHART_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={
            value === range
              ? "rounded border border-primary bg-primary-tint px-2 py-0.5 text-xs text-primary"
              : "rounded border border-border bg-surface px-2 py-0.5 text-xs text-text-muted hover:text-text"
          }
        >
          {t.dashboard.chartRangeOption(range)}
        </button>
      ))}
    </div>
  );
}
