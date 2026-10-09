import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "../lib/types";
import { SERIES_COLORS } from "../lib/regions";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";

export interface RegionTimeline {
  region: string;
  timeline: TrendPoint[];
}

interface TrendChartProps {
  series: RegionTimeline[];
}

const TICK_STYLE = { fontSize: 12, fontFamily: '"IBM Plex Mono", monospace', fill: "var(--color-text-muted)" };
const TARGET_TICK_COUNT = 12;

function seriesKey(region: string): string {
  return region === "" ? "worldwide" : region;
}

function formatTick(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [, month, day] = parts;
  return `${day}/${month}`;
}

function mergeSeries(series: RegionTimeline[]): Record<string, number | string>[] {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const { region, timeline } of series) {
    for (const point of timeline) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[seriesKey(region)] = point.value;
      byDate.set(point.date, row);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Line chart of one keyword's Google Trends interest-over-time, one line per active region, filling its container. */
export function TrendChart({ series }: TrendChartProps) {
  const { t } = useLanguage();
  const hasData = series.some((s) => s.timeline.length > 0);
  if (!hasData) {
    return <p className="text-sm text-text-muted">{t.dashboard.noDataYet}</p>;
  }

  const data = mergeSeries(series);
  // Recharts' automatic tick-thinning estimates label width to avoid overlap,
  // which skips an uneven number of days between labels. A fixed numeric
  // interval instead shows every Nth point, keeping the gaps uniform.
  const tickInterval = Math.max(0, Math.ceil(data.length / TARGET_TICK_COUNT) - 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} accessibilityLayer={false} margin={{ top: 8, right: 20, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tick={TICK_STYLE} tickFormatter={formatTick} interval={tickInterval} />
        <YAxis tick={TICK_STYLE} />
        <Tooltip
          labelFormatter={(label) => formatTick(String(label))}
          contentStyle={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-text)" }}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: '"IBM Plex Mono", monospace' }} />
        )}
        {series.map(({ region }, index) => (
          <Line
            key={region}
            type="monotone"
            dataKey={seriesKey(region)}
            name={regionLabel(t, region)}
            stroke={SERIES_COLORS[index]}
            strokeDasharray={index === 2 ? "6 4" : undefined}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
