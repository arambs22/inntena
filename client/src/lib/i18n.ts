export type Language = "es" | "en";

export interface Translations {
  nav: {
    history: string;
    toDarkMode: string;
    toLightMode: string;
    changeLanguage: string;
    logout: string;
  };
  auth: {
    login: {
      title: string;
      email: string;
      password: string;
      submit: string;
      submitting: string;
      noAccount: string;
      registerLink: string;
      forgotPasswordLink: string;
    };
    register: {
      title: string;
      email: string;
      password: string;
      passwordHint: string;
      submit: string;
      submitting: string;
      haveAccount: string;
      loginLink: string;
    };
    genericError: string;
    forgotPassword: {
      title: string;
      email: string;
      submit: string;
      submitting: string;
      success: string;
      backToLogin: string;
    };
    resetPassword: {
      title: string;
      newPassword: string;
      confirmPassword: string;
      submit: string;
      submitting: string;
      mismatch: string;
      invalidToken: string;
    };
    verifyEmail: {
      title: string;
      confirm: string;
      confirming: string;
      success: string;
      invalidToken: string;
    };
    verificationBanner: {
      message: string;
      resend: string;
      resent: string;
    };
  };
  account: {
    title: string;
    changePassword: {
      heading: string;
      current: string;
      new: string;
      confirm: string;
      submit: string;
      submitting: string;
      success: string;
      mismatch: string;
    };
    deleteAccount: {
      heading: string;
      warning: string;
      password: string;
      submit: string;
      submitting: string;
      confirmPrompt: string;
    };
  };
  common: {
    loading: string;
    close: string;
  };
  keywordForm: {
    keywordLabel: string;
    categoryLabel: string;
    keywordPlaceholder: string;
    categoryPlaceholder: string;
    submit: string;
    submitting: string;
  };
  keywordList: {
    empty: string;
    pause: string;
    resume: string;
    archive: string;
    pin: string;
    unpin: string;
    searchPlaceholder: string;
    searchAria: string;
    clearSearch: string;
    noMatches: (query: string) => string;
    sortLabel: string;
    sortOptions: { newest: string; oldest: string; alphabetical: string; category: string };
    limitCounter: (count: number, max: number) => string;
    limitReached: (max: number) => string;
  };
  blocked: {
    ariaLabel: string;
    title: string;
    explanation: string;
    lastAttempt: (timestamp: string) => string;
    failedAttempts: (n: number) => string;
  };
  regionTabs: {
    worldwide: string;
    removeAria: (label: string) => string;
    addRegion: string;
  };
  regionPicker: {
    header: string;
    close: string;
    allAdded: string;
  };
  dashboard: {
    loadingKeywords: string;
    selectKeywordPrompt: string;
    activateRegionPrompt: string;
    loadingTrends: string;
    trend: string;
    showingDays: (n: number) => string;
    dataAvailableIn: (regions: string) => string;
    noDataYet: string;
    relatedRising: string;
    keywordsError: string;
    chartRangeAria: string;
    chartRangeOption: (days: number) => string;
  };
  relatedQueries: {
    empty: string;
    noDataForColumn: string;
    viewAll: (n: number) => string;
    modalTitle: (region: string) => string;
    queryHeader: string;
    growthHeader: string;
    breakout: string;
    helpLabel: string;
    helpGrowth: string;
    helpBreakout: string;
    helpCaveat: string;
  };
  history: {
    title: string;
    retention: string;
    days: (n: number) => string;
    allRegions: string;
    empty: string;
    active: string;
    archivedExpires: (n: number) => string;
    restore: string;
    restoring: string;
    deleteForever: string;
    deleting: string;
    confirmDelete: (term: string) => string;
    searchPlaceholder: string;
    searchAria: string;
    noMatches: (query: string) => string;
  };
  supply: {
    listings: (count: string) => string;
    updatedAgo: (hours: number) => string;
    checking: string;
    unavailable: string;
    noData: string;
    demandTitle: string;
    supplyTitle: string;
    verdictTitle: string;
    demandIn: (region: string) => string;
    last14Days: string;
    sourceEtsy: string;
    helpLabel: string;
    helpDemand: string;
    helpSupply: (low: string, high: string) => string;
    helpVerdict: string;
    helpCaveat: string;
    momentum: { rising: string; steady: string; cooling: string; unknown: string };
    verdicts: { opportunity: string; promising: string; steady: string; crowded: string; cooling: string };
    verdictSentences: { opportunity: string; promising: string; steady: string; crowded: string; cooling: string };
  };
  footer: {
    terms: string;
    privacy: string;
    support: (email: string) => string;
    etsyNotice: string;
  };
  termsGate: {
    title: string;
    intro: string;
    checkbox: string;
    accept: string;
    accepting: string;
    logout: string;
  };
  authTerms: {
    acceptPrefix: string;
    termsLink: string;
    and: string;
    privacyLink: string;
    mustAccept: string;
  };
  legal: {
    backToApp: string;
    lastUpdated: (version: string) => string;
    termsTitle: string;
    privacyTitle: string;
  };
  regions: Record<string, string>;
}

const REGION_NAMES_ES: Record<string, string> = {
  "": "Mundial",
  US: "Estados Unidos",
  CA: "Canadá",
  GB: "Reino Unido",
  AU: "Australia",
  DE: "Alemania",
  FR: "Francia",
  ES: "España",
  IT: "Italia",
  NL: "Países Bajos",
  MX: "México",
  BR: "Brasil",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  PT: "Portugal",
  IE: "Irlanda",
  SE: "Suecia",
  NO: "Noruega",
  DK: "Dinamarca",
  FI: "Finlandia",
  PL: "Polonia",
  CH: "Suiza",
  AT: "Austria",
  BE: "Bélgica",
  JP: "Japón",
  KR: "Corea del Sur",
  IN: "India",
  SG: "Singapur",
  NZ: "Nueva Zelanda",
  ZA: "Sudáfrica",
};

const REGION_NAMES_EN: Record<string, string> = {
  "": "Worldwide",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  PT: "Portugal",
  IE: "Ireland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  JP: "Japan",
  KR: "South Korea",
  IN: "India",
  SG: "Singapore",
  NZ: "New Zealand",
  ZA: "South Africa",
};

export const TRANSLATIONS: Record<Language, Translations> = {
  es: {
    nav: {
      history: "Historial",
      toDarkMode: "Cambiar a modo oscuro",
      toLightMode: "Cambiar a modo claro",
      changeLanguage: "Cambiar idioma",
      logout: "Cerrar sesión",
    },
    auth: {
      login: {
        title: "Iniciar sesión",
        email: "Email",
        password: "Contraseña",
        submit: "Entrar",
        submitting: "Entrando...",
        noAccount: "¿No tienes cuenta?",
        registerLink: "Regístrate",
        forgotPasswordLink: "¿Olvidaste tu contraseña?",
      },
      register: {
        title: "Crear cuenta",
        email: "Email",
        password: "Contraseña",
        passwordHint: "Mínimo 8 caracteres.",
        submit: "Crear cuenta",
        submitting: "Creando...",
        haveAccount: "¿Ya tienes cuenta?",
        loginLink: "Inicia sesión",
      },
      genericError: "Algo salió mal, intenta de nuevo",
      forgotPassword: {
        title: "Recuperar contraseña",
        email: "Email",
        submit: "Enviar link",
        submitting: "Enviando...",
        success: "Si el email existe, te enviamos un link para restablecer tu contraseña.",
        backToLogin: "Volver a iniciar sesión",
      },
      resetPassword: {
        title: "Elegir nueva contraseña",
        newPassword: "Contraseña nueva",
        confirmPassword: "Confirmar contraseña",
        submit: "Guardar contraseña",
        submitting: "Guardando...",
        mismatch: "Las contraseñas no coinciden",
        invalidToken: "El link es inválido o venció. Solicita uno nuevo.",
      },
      verifyEmail: {
        title: "Verificar tu email",
        confirm: "Confirmar verificación",
        confirming: "Verificando...",
        success: "Tu email quedó verificado.",
        invalidToken: "El link es inválido o venció.",
      },
      verificationBanner: {
        message: "Todavía no verificaste tu email.",
        resend: "Reenviar verificación",
        resent: "Te reenviamos el email.",
      },
    },
    account: {
      title: "Mi cuenta",
      changePassword: {
        heading: "Cambiar contraseña",
        current: "Contraseña actual",
        new: "Contraseña nueva",
        confirm: "Confirmar contraseña",
        submit: "Actualizar contraseña",
        submitting: "Actualizando...",
        success: "Contraseña actualizada.",
        mismatch: "Las contraseñas no coinciden",
      },
      deleteAccount: {
        heading: "Eliminar cuenta",
        warning: "Vas a perder todos tus datos: keywords, tendencias y related queries. Esta acción no se puede deshacer.",
        password: "Contraseña",
        submit: "Eliminar mi cuenta",
        submitting: "Eliminando...",
        confirmPrompt: "¿Estás totalmente seguro? Esta acción no se puede deshacer.",
      },
    },
    common: {
      loading: "Cargando...",
      close: "Cerrar",
    },
    keywordForm: {
      keywordLabel: "Keyword",
      categoryLabel: "Categoría (opcional)",
      keywordPlaceholder: "Ej: Snoopy",
      categoryPlaceholder: "Ej: Clipart",
      submit: "Agregar",
      submitting: "Agregando...",
    },
    keywordList: {
      empty: "Todavía no trackeas ninguna keyword.",
      pause: "Pausar",
      resume: "Reanudar",
      archive: "Archivar",
      pin: "Fijar",
      unpin: "Quitar fijado",
      searchPlaceholder: "Buscar en tus keywords...",
      searchAria: "Buscar keywords",
      clearSearch: "Borrar búsqueda",
      noMatches: (query) => `Ninguna keyword coincide con "${query}".`,
      sortLabel: "Ordenar por",
      sortOptions: { newest: "Más reciente", oldest: "Más antigua", alphabetical: "A-Z", category: "Categoría" },
      limitCounter: (count, max) => `${count}/${max} keywords`,
      limitReached: (max) => `Llegaste al máximo de ${max} keywords activas. Archiva alguna para agregar otra.`,
    },
    blocked: {
      ariaLabel: "Recolección bloqueada — pasa el mouse para ver el detalle",
      title: "Recolección bloqueada",
      explanation:
        "Google Trends rechazó varios intentos seguidos de recolectar datos para esta keyword — normalmente por límite de solicitudes. Se resuelve solo en cuanto una recolección vuelva a tener éxito.",
      lastAttempt: (timestamp) => `Último intento: ${timestamp}`,
      failedAttempts: (n) => `${n} ${n === 1 ? "intento fallido" : "intentos fallidos"} seguidos`,
    },
    regionTabs: {
      worldwide: "Mundial",
      removeAria: (label) => `Quitar ${label}`,
      addRegion: "+ Región",
    },
    regionPicker: {
      header: "Agregar región",
      close: "Cerrar",
      allAdded: "Ya agregaste todas las regiones disponibles.",
    },
    dashboard: {
      loadingKeywords: "Cargando keywords...",
      selectKeywordPrompt: "Agrega o selecciona una keyword para ver su tendencia.",
      activateRegionPrompt: "Activa al menos una región para ver su tendencia.",
      loadingTrends: "Cargando datos de tendencia...",
      trend: "Tendencia",
      showingDays: (n) => `Mostrando ${n} ${n === 1 ? "día" : "días"}`,
      dataAvailableIn: (regions) => `Ya tienes datos en: ${regions}`,
      noDataYet: "Todavía no hay datos recolectados para esta keyword.",
      relatedRising: "Related queries en alza",
      keywordsError: "No se pudieron cargar tus keywords. Intenta de nuevo en unos minutos.",
      chartRangeAria: "Rango de tiempo del gráfico",
      chartRangeOption: (days) => `${days} días`,
    },
    relatedQueries: {
      empty: "Sin related queries en alza todavía.",
      noDataForColumn: "Sin datos.",
      viewAll: (n) => `Ver todas (+${n})`,
      modalTitle: (region) => `Related queries — ${region}`,
      queryHeader: "Búsqueda",
      growthHeader: "Crecimiento",
      breakout: "Breakout",
      helpLabel: "¿Qué significan estos números?",
      helpGrowth:
        "Cuánto creció el interés de búsqueda de cada frase en los últimos 90 días, comparado con el periodo anterior. Van de mayor a menor crecimiento.",
      helpBreakout:
        "\"Breakout\" es un crecimiento enorme (más de 5,000%), normalmente de frases nuevas que antes casi no se buscaban.",
      helpCaveat: "Ojo: es un porcentaje, no un volumen. Una frase puede subir 500% y seguir con muy pocas búsquedas.",
    },
    history: {
      title: "Historial",
      retention: "Retención",
      days: (n) => `${n} días`,
      allRegions: "Todas las regiones",
      empty: "Sin keywords en tu historial.",
      active: "Activa",
      archivedExpires: (n) => `Archivada — expira en ${n} días`,
      restore: "Restaurar",
      restoring: "Restaurando...",
      deleteForever: "Eliminar para siempre",
      deleting: "Eliminando...",
      confirmDelete: (term) =>
        `Vas a perder todos los datos que has recolectado para "${term}". Esta acción no se puede deshacer. ¿Estás seguro?`,
      searchPlaceholder: "Buscar en tu historial...",
      searchAria: "Buscar en el historial",
      noMatches: (query) => `Nada en tu historial coincide con "${query}".`,
    },
    supply: {
      listings: (count) => `${count} listings`,
      updatedAgo: (hours) => (hours < 1 ? "Actualizado hace menos de 1 h" : `Actualizado hace ${hours} h`),
      checking: "Consultando Etsy…",
      unavailable: "Datos de Etsy no disponibles",
      noData: "—",
      demandTitle: "Demanda",
      supplyTitle: "Oferta en Etsy",
      verdictTitle: "Veredicto",
      demandIn: (region) => `En ${region}`,
      last14Days: "últimos 14 días",
      sourceEtsy: "Fuente: Etsy",
      helpLabel: "¿Cómo se calcula el veredicto?",
      helpDemand:
        "Demanda: compara el interés promedio en Google Trends de los últimos 14 días con los 14 anteriores, en la primera región que tienes activa. Un cambio de +15% o más es \"al alza\"; de −15% o menos, \"a la baja\".",
      helpSupply: (low, high) =>
        `Oferta: cuántos listings activos hay en Etsy para ese término. Baja: menos de ${low}. Media: hasta ${high}. Alta: más que eso.`,
      helpVerdict:
        "Veredicto: demanda al alza con oferta baja es una oportunidad; oferta alta es saturación; demanda a la baja es que se está enfriando.",
      helpCaveat:
        "Es una guía aproximada: el conteo de Etsy no se filtra por categoría y puede incluir listings que no tienen que ver.",
      momentum: { rising: "Al alza", steady: "Estable", cooling: "A la baja", unknown: "Sin datos suficientes" },
      verdicts: {
        opportunity: "Oportunidad",
        promising: "Prometedora",
        steady: "Estable",
        crowded: "Saturada",
        cooling: "Enfriándose",
      },
      verdictSentences: {
        opportunity: "La demanda sube y hay pocos vendedores compitiendo.",
        promising: "La demanda sube y la competencia es moderada.",
        steady: "La demanda se mantiene; la competencia es baja o moderada.",
        crowded: "Ya hay muchos vendedores compitiendo por este término.",
        cooling: "El interés en este término va a la baja.",
      },
    },
    footer: {
      terms: "Términos de uso",
      privacy: "Política de privacidad",
      support: (email) => `Soporte: ${email}`,
      etsyNotice:
        "El término 'Etsy' es una marca comercial de Etsy, Inc. Esta aplicación utiliza la API de Etsy, pero no cuenta con el respaldo de Etsy ni está certificada por Etsy.",
    },
    termsGate: {
      title: "Revisa nuestros términos",
      intro: "Para seguir usando Inntena debes aceptar los Términos de uso y la Política de privacidad.",
      checkbox: "He leído y acepto los Términos de uso y la Política de privacidad",
      accept: "Aceptar y continuar",
      accepting: "Guardando...",
      logout: "Cerrar sesión",
    },
    authTerms: {
      acceptPrefix: "Acepto los",
      termsLink: "Términos de uso",
      and: "y la",
      privacyLink: "Política de privacidad",
      mustAccept: "Debes aceptar los términos para crear una cuenta.",
    },
    legal: {
      backToApp: "Volver a Inntena",
      lastUpdated: (version) => `Última actualización: ${version}`,
      termsTitle: "Términos de uso",
      privacyTitle: "Política de privacidad",
    },
    regions: REGION_NAMES_ES,
  },
  en: {
    nav: {
      history: "History",
      toDarkMode: "Switch to dark mode",
      toLightMode: "Switch to light mode",
      changeLanguage: "Change language",
      logout: "Log out",
    },
    auth: {
      login: {
        title: "Log in",
        email: "Email",
        password: "Password",
        submit: "Log in",
        submitting: "Logging in...",
        noAccount: "Don't have an account?",
        registerLink: "Sign up",
        forgotPasswordLink: "Forgot your password?",
      },
      register: {
        title: "Create account",
        email: "Email",
        password: "Password",
        passwordHint: "At least 8 characters.",
        submit: "Create account",
        submitting: "Creating...",
        haveAccount: "Already have an account?",
        loginLink: "Log in",
      },
      genericError: "Something went wrong, please try again",
      forgotPassword: {
        title: "Recover password",
        email: "Email",
        submit: "Send link",
        submitting: "Sending...",
        success: "If that email is registered, we sent a link to reset your password.",
        backToLogin: "Back to log in",
      },
      resetPassword: {
        title: "Choose a new password",
        newPassword: "New password",
        confirmPassword: "Confirm password",
        submit: "Save password",
        submitting: "Saving...",
        mismatch: "Passwords don't match",
        invalidToken: "This link is invalid or expired. Request a new one.",
      },
      verifyEmail: {
        title: "Verify your email",
        confirm: "Confirm verification",
        confirming: "Verifying...",
        success: "Your email is now verified.",
        invalidToken: "This link is invalid or expired.",
      },
      verificationBanner: {
        message: "You haven't verified your email yet.",
        resend: "Resend verification",
        resent: "We resent the email.",
      },
    },
    account: {
      title: "My account",
      changePassword: {
        heading: "Change password",
        current: "Current password",
        new: "New password",
        confirm: "Confirm password",
        submit: "Update password",
        submitting: "Updating...",
        success: "Password updated.",
        mismatch: "Passwords don't match",
      },
      deleteAccount: {
        heading: "Delete account",
        warning: "You'll lose all your data: keywords, trends, and related queries. This can't be undone.",
        password: "Password",
        submit: "Delete my account",
        submitting: "Deleting...",
        confirmPrompt: "Are you absolutely sure? This can't be undone.",
      },
    },
    common: {
      loading: "Loading...",
      close: "Close",
    },
    keywordForm: {
      keywordLabel: "Keyword",
      categoryLabel: "Category (optional)",
      keywordPlaceholder: "E.g. Snoopy",
      categoryPlaceholder: "E.g. Clipart",
      submit: "Add",
      submitting: "Adding...",
    },
    keywordList: {
      empty: "You aren't tracking any keywords yet.",
      pause: "Pause",
      resume: "Resume",
      archive: "Archive",
      pin: "Pin",
      unpin: "Unpin",
      searchPlaceholder: "Search your keywords...",
      searchAria: "Search keywords",
      clearSearch: "Clear search",
      noMatches: (query) => `No keyword matches "${query}".`,
      sortLabel: "Sort by",
      sortOptions: { newest: "Newest", oldest: "Oldest", alphabetical: "A-Z", category: "Category" },
      limitCounter: (count, max) => `${count}/${max} keywords`,
      limitReached: (max) => `You've reached the limit of ${max} active keywords. Archive one to add another.`,
    },
    blocked: {
      ariaLabel: "Collection blocked — hover for details",
      title: "Collection blocked",
      explanation:
        "Google Trends rejected several collection attempts in a row for this keyword — usually a rate limit. It resolves itself as soon as a collection succeeds again.",
      lastAttempt: (timestamp) => `Last attempt: ${timestamp}`,
      failedAttempts: (n) => `${n} failed ${n === 1 ? "attempt" : "attempts"} in a row`,
    },
    regionTabs: {
      worldwide: "Worldwide",
      removeAria: (label) => `Remove ${label}`,
      addRegion: "+ Region",
    },
    regionPicker: {
      header: "Add region",
      close: "Close",
      allAdded: "You've already added every available region.",
    },
    dashboard: {
      loadingKeywords: "Loading keywords...",
      selectKeywordPrompt: "Add or select a keyword to see its trend.",
      activateRegionPrompt: "Turn on at least one region to see its trend.",
      loadingTrends: "Loading trend data...",
      trend: "Trend",
      showingDays: (n) => `Showing ${n} ${n === 1 ? "day" : "days"}`,
      dataAvailableIn: (regions) => `You already have data for: ${regions}`,
      noDataYet: "No data collected for this keyword yet.",
      relatedRising: "Rising related queries",
      keywordsError: "Couldn't load your keywords. Try again in a few minutes.",
      chartRangeAria: "Chart time range",
      chartRangeOption: (days) => `${days} days`,
    },
    relatedQueries: {
      empty: "No rising related queries yet.",
      noDataForColumn: "No data.",
      viewAll: (n) => `View all (+${n})`,
      modalTitle: (region) => `Related queries — ${region}`,
      queryHeader: "Search",
      growthHeader: "Growth",
      breakout: "Breakout",
      helpLabel: "What do these numbers mean?",
      helpGrowth:
        "How much interest in each search phrase grew over the last 90 days, compared with the previous period. Sorted from the largest growth to the smallest.",
      helpBreakout:
        "\"Breakout\" means a huge increase (over 5,000%), usually for new phrases that were barely searched before.",
      helpCaveat: "Note: this is a percentage, not a volume. A phrase can grow 500% and still have very few searches.",
    },
    history: {
      title: "History",
      retention: "Retention",
      days: (n) => `${n} days`,
      allRegions: "All regions",
      empty: "No keywords in your history.",
      active: "Active",
      archivedExpires: (n) => `Archived — expires in ${n} days`,
      restore: "Restore",
      restoring: "Restoring...",
      deleteForever: "Delete forever",
      deleting: "Deleting...",
      confirmDelete: (term) =>
        `You're about to lose all the data collected for "${term}". This can't be undone. Are you sure?`,
      searchPlaceholder: "Search your history...",
      searchAria: "Search history",
      noMatches: (query) => `Nothing in your history matches "${query}".`,
    },
    supply: {
      listings: (count) => `${count} listings`,
      updatedAgo: (hours) => (hours < 1 ? "Updated less than 1 h ago" : `Updated ${hours} h ago`),
      checking: "Checking Etsy…",
      unavailable: "Etsy data unavailable",
      noData: "—",
      demandTitle: "Demand",
      supplyTitle: "Supply on Etsy",
      verdictTitle: "Verdict",
      demandIn: (region) => `In ${region}`,
      last14Days: "last 14 days",
      sourceEtsy: "Source: Etsy",
      helpLabel: "How is the verdict calculated?",
      helpDemand:
        "Demand: compares the average Google Trends interest of the last 14 days with the 14 days before, in the first region you have active. A change of +15% or more is \"rising\"; −15% or less is \"cooling\".",
      helpSupply: (low, high) =>
        `Supply: how many active Etsy listings match the term. Low: under ${low}. Medium: up to ${high}. High: above that.`,
      helpVerdict:
        "Verdict: rising demand with low supply is an opportunity; high supply is crowded; falling demand is cooling.",
      helpCaveat:
        "This is a rough guide: the Etsy count is not filtered by category and may include unrelated listings.",
      momentum: { rising: "Rising", steady: "Steady", cooling: "Cooling", unknown: "Not enough data" },
      verdicts: {
        opportunity: "Opportunity",
        promising: "Promising",
        steady: "Steady",
        crowded: "Crowded",
        cooling: "Cooling",
      },
      verdictSentences: {
        opportunity: "Demand is rising and few sellers are competing.",
        promising: "Demand is rising and competition is moderate.",
        steady: "Demand is steady; competition is low to moderate.",
        crowded: "Many sellers already compete for this term.",
        cooling: "Interest in this term is fading.",
      },
    },
    footer: {
      terms: "Terms of Use",
      privacy: "Privacy Policy",
      support: (email) => `Support: ${email}`,
      etsyNotice:
        "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.",
    },
    termsGate: {
      title: "Please review our terms",
      intro: "To keep using Inntena you need to accept the Terms of Use and the Privacy Policy.",
      checkbox: "I have read and accept the Terms of Use and the Privacy Policy",
      accept: "Accept and continue",
      accepting: "Saving...",
      logout: "Log out",
    },
    authTerms: {
      acceptPrefix: "I accept the",
      termsLink: "Terms of Use",
      and: "and the",
      privacyLink: "Privacy Policy",
      mustAccept: "You must accept the terms to create an account.",
    },
    legal: {
      backToApp: "Back to Inntena",
      lastUpdated: (version) => `Last updated: ${version}`,
      termsTitle: "Terms of Use",
      privacyTitle: "Privacy Policy",
    },
    regions: REGION_NAMES_EN,
  },
};

/** Resolves a region code to its display label in the given language; "" is Worldwide, unrecognized codes fall back to the raw code. */
export function regionLabel(t: Translations, code: string): string {
  return t.regions[code] ?? code;
}
