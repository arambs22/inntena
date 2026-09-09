import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { TRANSLATIONS, type Language, type Translations } from "../lib/i18n";

interface LanguageContextValue {
  language: Language;
  t: Translations;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = "inntena_language";

function getInitialLanguage(): Language {
  return localStorage.getItem(STORAGE_KEY) === "es" ? "es" : "en";
}

/** Tracks the active UI language, keeping localStorage in sync with it. Defaults to English. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  function toggleLanguage() {
    setLanguage((prev) => (prev === "es" ? "en" : "es"));
  }

  return (
    <LanguageContext.Provider value={{ language, t: TRANSLATIONS[language], toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Reads the active language, its translation table, and the toggle action; must be used within a LanguageProvider. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
