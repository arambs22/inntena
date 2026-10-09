import { useState } from "react";
import { SERIES_COLORS } from "../lib/regions";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";
import { RegionPicker } from "./RegionPicker";

interface RegionTabsProps {
  added: string[];
  active: string[];
  onToggle: (code: string) => void;
  onRemove: (code: string) => void;
  onAdd: (code: string) => void;
}

/** Region tab bar: fixed Worldwide tab, one tab per added region, and a picker to add more (max 3 active at once). */
export function RegionTabs({ added, active, onToggle, onRemove, onAdd }: RegionTabsProps) {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Active tabs cluster right after Worldwide, in the order they were activated (the order
  // they already appear in `active`), so turning one on doesn't leave it scattered among the
  // inactive tabs — the newest active region lands right next to the others that are on.
  const activeAdded = active.filter((code) => code !== "" && added.includes(code));
  const inactiveAdded = added.filter((code) => !active.includes(code));
  const orderedAdded = [...activeAdded, ...inactiveAdded];

  function tabClass(isActive: boolean) {
    return `flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
      isActive ? "border-primary bg-primary-tint text-primary" : "border-border bg-surface text-text-muted"
    }`;
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onToggle("")} className={tabClass(active.includes(""))}>
        {active.includes("") && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: SERIES_COLORS[active.indexOf("")] }}
          />
        )}
        {t.regionTabs.worldwide}
      </button>
      {orderedAdded.map((code) => {
        const isActive = active.includes(code);
        return (
          <span key={code} className={tabClass(isActive)}>
            <button type="button" onClick={() => onToggle(code)} className="flex items-center gap-1.5">
              {isActive && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[active.indexOf(code)] }}
                />
              )}
              {regionLabel(t, code)}
            </button>
            <button
              type="button"
              onClick={() => onRemove(code)}
              aria-label={t.regionTabs.removeAria(regionLabel(t, code))}
              className="text-text-muted hover:text-primary"
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => setPickerOpen((prev) => !prev)}
        className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-text-muted hover:border-primary hover:text-primary"
      >
        {t.regionTabs.addRegion}
      </button>
      {pickerOpen && (
        <RegionPicker
          excluding={added}
          onPick={(code) => {
            onAdd(code);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
