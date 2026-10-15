import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../lib/api";
import { ETSY_CATEGORIES } from "../lib/etsyCategories";

interface EtsyCategorySelectProps {
  keywordId: number;
  value: number | null;
  /** Called after the category was saved, so the caller can reload keywords and supply. */
  onChanged: () => void;
}

/** Etsy category that scopes a keyword's supply count and listing examples ("All categories" = none). */
export function EtsyCategorySelect({ keywordId, value, onChanged }: EtsyCategorySelectProps) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    setSaving(true);
    try {
      await api.patch(`/keywords/${keywordId}/etsy-category`, { taxonomyId: next === "" ? null : Number(next) });
      onChanged();
    } catch {
      // The select snaps back to the saved value on the next render; nothing else to do.
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      aria-label={t.etsy.categoryLabel}
      value={value === null ? "" : String(value)}
      disabled={saving}
      onChange={(event) => void handleChange(event.target.value)}
      className="max-w-[11rem] rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text"
    >
      <option value="">{t.etsy.allCategories}</option>
      {ETSY_CATEGORIES.map((category) => (
        <option key={category.id} value={category.id}>
          {t.etsy.categories[category.key]}
        </option>
      ))}
    </select>
  );
}
