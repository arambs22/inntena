import { useLanguage } from "../context/LanguageContext";

/** The notice Etsy's API terms require wherever Etsy data is shown. */
export function EtsyAttribution() {
  const { t } = useLanguage();
  return <p className="text-xs leading-relaxed text-text-muted">{t.footer.etsyNotice}</p>;
}
