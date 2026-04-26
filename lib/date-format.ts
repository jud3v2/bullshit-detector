import type { Language } from './i18n';

const localeByLanguage: Record<Language, string> = {
  en: 'en-US',
  fr: 'fr-FR',
};

export function formatHumanDate(value: string | number | Date | null | undefined, language: Language, options?: Intl.DateTimeFormatOptions) {
  const date = toDate(value);

  if (!date) {
    return language === 'fr' ? 'Date inconnue' : 'Unknown date';
  }

  return new Intl.DateTimeFormat(localeByLanguage[language], {
    day: '2-digit',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...options,
  }).format(date);
}

export function formatHumanDateTime(value: string | number | Date | null | undefined, language: Language) {
  return formatHumanDate(value, language, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeDate(value: string | number | Date | null | undefined, language: Language) {
  const date = toDate(value);

  if (!date) {
    return language === 'fr' ? 'Date inconnue' : 'Unknown date';
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDelta = Math.round((startOfDate - startOfToday) / 86_400_000);

  if (Math.abs(dayDelta) <= 7) {
    return formatRelativeDayFallback(dayDelta, language);
  }

  return formatHumanDate(date, language);
}

export function formatResetDate(value: string | number | Date | null | undefined, language: Language) {
  const date = toDate(value);

  if (!date) {
    return language === 'fr' ? 'reset inconnu' : 'unknown reset';
  }

  const relative = formatRelativeDate(date, language);
  const time = new Intl.DateTimeFormat(localeByLanguage[language], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return language === 'fr' ? `${relative} a ${time}` : `${relative} at ${time}`;
}

function toDate(value: string | number | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeDayFallback(dayDelta: number, language: Language) {
  const relativeTimeFormat = Intl.RelativeTimeFormat;

  if (relativeTimeFormat) {
    return new relativeTimeFormat(localeByLanguage[language], { numeric: 'auto' }).format(dayDelta, 'day');
  }

  if (language === 'fr') {
    if (dayDelta === -1) return 'hier';
    if (dayDelta === 0) return 'aujourd’hui';
    if (dayDelta === 1) return 'demain';
    if (dayDelta < 0) return `il y a ${Math.abs(dayDelta)} jours`;
    return `dans ${dayDelta} jours`;
  }

  if (dayDelta === -1) return 'yesterday';
  if (dayDelta === 0) return 'today';
  if (dayDelta === 1) return 'tomorrow';
  if (dayDelta < 0) return `${Math.abs(dayDelta)} days ago`;
  return `in ${dayDelta} days`;
}
