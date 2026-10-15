import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";

interface DemandRegionSelectorProps {
  regions: string[];
  value: string;
  onChange: (region: string) => void;
}

/** Segmented control choosing which active region the demand figure and verdict refer to. Hidden with one region. */
export function DemandRegionSelector({ regions, value, onChange }: DemandRegionSelectorProps) {
  const { t } = useLanguage();
  if (regions.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={t.etsy.demandRegionLabel} className="flex flex-wrap gap-1">
      {regions.map((region) => {
        const selected = region === value;
        return (
          <button
            key={region || "worldwide"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(region)}
            className={`rounded border px-2 py-0.5 text-xs ${
              selected ? "border-primary-line bg-primary-tint text-primary" : "border-border text-text-muted hover:text-text"
            }`}
          >
            {regionLabel(t, region)}
          </button>
        );
      })}
    </div>
  );
}
