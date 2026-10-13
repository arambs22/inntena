import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { buildPrivacy, buildTerms, resolveLegalContext } from "../lib/legalContent";
import { usePublicConfig } from "../lib/usePublicConfig";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";

interface LegalPageProps {
  kind: "terms" | "privacy";
}

/** Public page showing the Terms of Use or the Privacy Policy, in the active language. */
export function LegalPage({ kind }: LegalPageProps) {
  const { t, language } = useLanguage();
  const config = usePublicConfig();
  const context = resolveLegalContext(language, config);
  const document = kind === "terms" ? buildTerms(language, context) : buildPrivacy(language, context);

  return (
    <div className="relative min-h-screen bg-bg px-4 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-8 shadow-sm">
        <Link to="/" className="text-sm text-primary underline">
          {t.legal.backToApp}
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold text-text">{document.title}</h1>
        {config && <p className="mt-1 text-xs text-text-muted">{t.legal.lastUpdated(config.termsVersion)}</p>}
        {document.sections.map((section) => (
          <section key={section.heading} className="mt-6">
            <h2 className="font-display text-lg font-semibold text-text">{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="mt-2 text-sm leading-relaxed text-text">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
