import { TRANSLATIONS, type Language } from "./i18n";
import type { PublicConfig } from "./types";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  sections: LegalSection[];
}

/** Instance-specific values the documents mention. */
export interface LegalContext {
  operator: string;
  contact: string;
}

const FALLBACK: Record<Language, LegalContext> = {
  en: { operator: "the operator of this Inntena instance", contact: "the contact details published by the operator" },
  es: { operator: "el operador de esta instancia de Inntena", contact: "los datos de contacto que publique el operador" },
};

/** Fills the operator name and contact from the instance configuration, with neutral wording when they are not set. */
export function resolveLegalContext(language: Language, config: PublicConfig | null): LegalContext {
  return {
    operator: config?.operatorName ?? FALLBACK[language].operator,
    contact: config?.supportEmail ?? FALLBACK[language].contact,
  };
}

/**
 * The Terms of Use. Plain-language starting text, not legal advice: every statement must be true of the instance
 * that publishes it, which is the operator's responsibility to check. The Etsy disclaimer follows the wording Etsy's
 * API terms require ("substantially similar"); the Spanish text is Etsy's own.
 */
export function buildTerms(language: Language, { operator, contact }: LegalContext): LegalDocument {
  const t = TRANSLATIONS[language];

  if (language === "es") {
    return {
      title: t.legal.termsTitle,
      sections: [
        {
          heading: "1. Qué es Inntena",
          paragraphs: [
            `Inntena es una herramienta gratuita y de código abierto que ayuda a vendedores de productos digitales a investigar tendencias de nicho. La ofrece ${operator} (el "Desarrollador de la aplicación").`,
          ],
        },
        {
          heading: "2. Tu cuenta",
          paragraphs: [
            "Eres responsable de tu cuenta y de mantener segura tu contraseña. Debes indicar un correo electrónico válido. Puedes eliminar tu cuenta en cualquier momento desde el menú de cuenta.",
          ],
        },
        {
          heading: "3. Uso aceptable",
          paragraphs: [
            "No uses el servicio para dañarlo, saltarte sus límites, acceder a datos de otras personas, ni para incumplir la ley o los términos de los servicios en los que se apoya. El servicio limita cuántas keywords puede seguir cada cuenta para mantenerse disponible para todos.",
          ],
        },
        {
          heading: "4. Fuentes de datos y precisión",
          paragraphs: [
            "Los datos de tendencia vienen de Google Trends y los de oferta de Etsy. Ambos pueden tener retraso, estar incompletos o ser imprecisos; el conteo de Etsy se basa en su búsqueda y puede incluir listings que no tienen que ver, aunque elijas una categoría. Los ejemplos de listings se muestran tal como los devuelve Etsy y pueden cambiar o desaparecer. Las sugerencias de \"Descubrir\" son búsquedas en alza y fechas de temporada, no ventas comprobadas. Los veredictos que se muestran (como \"Oportunidad\") son guías aproximadas, no asesoría; tú decides qué crear y vender, bajo tu propio riesgo.",
          ],
        },
        {
          heading: "5. Etsy",
          paragraphs: [
            `DESCARGO DE RESPONSABILIDAD: ESTA APLICACIÓN LA PROPORCIONA ÚNICAMENTE ${operator} (EL "DESARROLLADOR DE LA APLICACIÓN"). ACEPTAS QUE ETSY, INC. Y SUS FILIALES NO SON EL DESARROLLADOR DE LA APLICACIÓN, NO PROPORCIONAN EL SERVICIO DE LA APLICACIÓN Y NO HACEN GARANTÍAS DE NINGÚN TIPO CON RESPECTO A LA APLICACIÓN O A LOS DATOS A LOS QUE SE ACCEDEN A TRAVÉS DE ELLA.`,
            t.footer.etsyNotice,
          ],
        },
        {
          heading: "6. Sin garantías",
          paragraphs: [
            "El servicio se ofrece \"tal cual\", sin garantías de ningún tipo, y puede cambiar, interrumpirse o discontinuarse en cualquier momento. En la medida que la ley lo permita, el Desarrollador de la aplicación no responde por pérdidas derivadas de su uso.",
          ],
        },
        {
          heading: "7. Terminar",
          paragraphs: [
            "Puedes dejar de usar Inntena y eliminar tu cuenta cuando quieras. El Desarrollador de la aplicación puede suspender cuentas que incumplan estos términos.",
          ],
        },
        {
          heading: "8. Cambios",
          paragraphs: ["Estos términos pueden cambiar. Cuando cambien, se te pedirá aceptar la nueva versión antes de continuar."],
        },
        { heading: "9. Contacto", paragraphs: [`Dudas o soporte: ${contact}.`] },
      ],
    };
  }

  return {
    title: t.legal.termsTitle,
    sections: [
      {
        heading: "1. What Inntena is",
        paragraphs: [
          `Inntena is a free, open-source tool that helps sellers of digital products research niche trends. It is provided by ${operator} (the "App Developer").`,
        ],
      },
      {
        heading: "2. Your account",
        paragraphs: [
          "You are responsible for your account and for keeping your password safe. You must provide a valid email address. You can delete your account at any time from the account menu.",
        ],
      },
      {
        heading: "3. Acceptable use",
        paragraphs: [
          "Do not use the service to harm it, bypass its limits, access other people's data, or break the law or the terms of the services it relies on. The service limits how many keywords each account can track so that it stays available to everyone.",
        ],
      },
      {
        heading: "4. Data sources and accuracy",
        paragraphs: [
          "Trend data comes from Google Trends and supply data from Etsy. Both can be delayed, incomplete or inaccurate; Etsy counts come from its search and may include unrelated listings, even when you choose a category. Listing examples are shown as Etsy returns them and may change or disappear. \"Discover\" suggestions are rising searches and seasonal dates, not proven sales. The verdicts shown (such as \"Opportunity\") are rough guides, not advice; you decide what to make and sell, at your own risk.",
        ],
      },
      {
        heading: "5. Etsy",
        paragraphs: [
          `DISCLAIMER: THIS APPLICATION IS PROVIDED SOLELY BY ${operator} (THE "APP DEVELOPER"). YOU AGREE THAT ETSY, INC. AND ITS AFFILIATES ARE NOT THE APP DEVELOPER, DO NOT PROVIDE THE APP SERVICE AND MAKE NO WARRANTIES OF ANY KIND WITH RESPECT TO THE APPLICATION OR THE DATA ACCESSED THROUGH IT.`,
          t.footer.etsyNotice,
        ],
      },
      {
        heading: "6. No warranty",
        paragraphs: [
          "The service is provided \"as is\", without warranties of any kind, and may change, be interrupted or be discontinued at any time. To the extent the law allows, the App Developer is not liable for losses arising from its use.",
        ],
      },
      {
        heading: "7. Ending",
        paragraphs: [
          "You can stop using Inntena and delete your account at any time. The App Developer may suspend accounts that break these terms.",
        ],
      },
      {
        heading: "8. Changes",
        paragraphs: ["These terms may change. When they do, you will be asked to accept the new version before continuing."],
      },
      { heading: "9. Contact", paragraphs: [`Questions or support: ${contact}.`] },
    ],
  };
}

/**
 * The Privacy Policy. Plain-language starting text, not legal advice. It lists the services that actually process
 * data in the reference deployment (hosting, database, email); an instance that uses others must edit this list.
 */
export function buildPrivacy(language: Language, { operator, contact }: LegalContext): LegalDocument {
  const t = TRANSLATIONS[language];

  if (language === "es") {
    return {
      title: t.legal.privacyTitle,
      sections: [
        { heading: "1. Quiénes somos", paragraphs: [`Inntena la opera ${operator}. Contacto: ${contact}.`] },
        {
          heading: "2. Qué guardamos",
          paragraphs: [
            "Tu correo electrónico; un hash de tu contraseña, que no se puede revertir (nunca la contraseña en sí); las keywords y regiones que sigues; tus preferencias (como cuánto tiempo se conservan las keywords archivadas); y los datos de tendencia y búsquedas relacionadas recolectados para tus keywords.",
          ],
        },
        {
          heading: "3. Para qué lo usamos",
          paragraphs: [
            "Para operar tu cuenta, enviarte correos de verificación y de restablecimiento de contraseña, y mostrarte tu panel. No lo usamos para publicidad ni analítica, y no lo vendemos.",
          ],
        },
        {
          heading: "4. Quién lo procesa",
          paragraphs: [
            "Para operar Inntena usamos: Render (alojamiento de la aplicación), Neon (base de datos) y SendGrid (envío de correos). Procesan datos por cuenta nuestra. La aplicación también carga sus tipografías desde Google Fonts (fonts.googleapis.com y fonts.gstatic.com), por lo que tu dirección IP se envía a Google cada vez que se carga una página. Cuando se muestran ejemplos de listings de Etsy, sus imágenes se cargan directamente desde los servidores de Etsy (i.etsystatic.com), así que Etsy recibe tu dirección IP y datos de tu navegador.",
          ],
        },
        {
          heading: "5. Qué sale del servicio",
          paragraphs: [
            "Los términos de búsqueda que sigues se envían a Google Trends y a Etsy para obtener datos de tendencia y de oferta. Se envían sin tu nombre, tu correo ni ningún identificador de tu cuenta.",
          ],
        },
        {
          heading: "6. Cookies y almacenamiento local",
          paragraphs: [
            "Inntena usa una cookie esencial que te mantiene con la sesión iniciada. Tu navegador también guarda localmente tus preferencias (tema, idioma, regiones, orden y rango del gráfico). No hay cookies de publicidad ni de analítica.",
          ],
        },
        {
          heading: "7. Conservación y eliminación",
          paragraphs: [
            "Conservamos tus datos mientras exista tu cuenta. Puedes eliminarla desde el menú de cuenta, lo que borra de forma permanente tus keywords, los datos de tendencia recolectados y el registro de tu cuenta de la base de datos de la aplicación. Las keywords archivadas se eliminan una vez pasado el periodo de retención que elijas, la próxima vez que se cargue tu historial.",
          ],
        },
        {
          heading: "8. Tus opciones",
          paragraphs: [
            `Puedes corregir o eliminar tus datos desde la aplicación, o pedir una copia escribiendo a ${contact}.`,
          ],
        },
        {
          heading: "9. Cambios",
          paragraphs: ["Si esta política cambia de forma importante, se te pedirá aceptar la nueva versión."],
        },
      ],
    };
  }

  return {
    title: t.legal.privacyTitle,
    sections: [
      { heading: "1. Who we are", paragraphs: [`Inntena is operated by ${operator}. Contact: ${contact}.`] },
      {
        heading: "2. What we store",
        paragraphs: [
          "Your email address; a one-way hash of your password (never the password itself); the keywords and regions you track; your preferences (such as how long archived keywords are kept); and the trend and related-search data collected for your keywords.",
        ],
      },
      {
        heading: "3. What we use it for",
        paragraphs: [
          "To run your account, send you verification and password-reset emails, and show you your dashboard. We do not use it for advertising or analytics, and we do not sell it.",
        ],
      },
      {
        heading: "4. Who processes it",
        paragraphs: [
          "To run Inntena we use: Render (application hosting), Neon (database) and SendGrid (sending emails). They process data on our behalf. The app also loads its fonts from Google Fonts (fonts.googleapis.com and fonts.gstatic.com), which means your IP address is sent to Google whenever a page loads. When Etsy listing examples are shown, their pictures load directly from Etsy's servers (i.etsystatic.com), so Etsy receives your IP address and browser details.",
        ],
      },
      {
        heading: "5. What leaves the service",
        paragraphs: [
          "The search terms you track are sent to Google Trends and to Etsy to obtain trend and supply data. They are sent without your name, your email or any identifier of your account.",
        ],
      },
      {
        heading: "6. Cookies and local storage",
        paragraphs: [
          "Inntena sets one essential cookie that keeps you logged in. Your browser also stores your preferences locally (theme, language, regions, sort order and chart range). There are no advertising or analytics cookies.",
        ],
      },
      {
        heading: "7. Retention and deletion",
        paragraphs: [
          "We keep your data while your account exists. You can delete your account from the account menu, which permanently removes your keywords, the collected trend data and your account record from the application's database. Archived keywords are removed after the retention period you choose, when your history is next loaded.",
        ],
      },
      {
        heading: "8. Your choices",
        paragraphs: [`You can correct or delete your data from within the app, or ask for a copy by writing to ${contact}.`],
      },
      {
        heading: "9. Changes",
        paragraphs: ["If this policy changes materially, you will be asked to accept the new version."],
      },
    ],
  };
}
