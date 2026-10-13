import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { usePublicConfig } from "../lib/usePublicConfig";
import { EtsyAttribution } from "./EtsyAttribution";

interface AppFooterProps {
  /** Show the Etsy trademark notice; required whenever Etsy data is on screen. */
  showEtsyNotice: boolean;
}

/** Page footer: legal links, the support address (from the instance configuration) and, when needed, the Etsy notice. */
export function AppFooter({ showEtsyNotice }: AppFooterProps) {
  const { t } = useLanguage();
  const config = usePublicConfig();

  return (
    <footer className="shrink-0 space-y-1 border-t border-border px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <Link to="/terms" className="underline hover:text-text">{t.footer.terms}</Link>
        <Link to="/privacy" className="underline hover:text-text">{t.footer.privacy}</Link>
        {config?.supportEmail && (
          <a href={`mailto:${config.supportEmail}`} className="underline hover:text-text">
            {t.footer.support(config.supportEmail)}
          </a>
        )}
      </div>
      {showEtsyNotice && <EtsyAttribution />}
    </footer>
  );
}
