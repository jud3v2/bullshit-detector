import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  type DimensionValue,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Provider, Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShareSourcePill } from '@/components/share-source-pill';
import {
  AdvancedAiRequestError,
  analyzeWithAdvancedAi,
  getAiRuntimeLabel,
  getBackendUrl,
  usesSupabaseAnalyzeBackend,
  type AdvancedAiAnalysis,
} from '@/lib/ai-gateway-client';
import { saveAnalysisHistoryEntry } from '@/lib/analysis-history';
import { syncBillingFromSupabase } from '@/lib/billing-sync';
import type { DetectionResult, RiskLevel } from '@/lib/detector';
import { examplesByLanguage, translations, type Language } from '@/lib/i18n';
import {
  analyzeSocialUrl,
  buildUrlAnalysisInput,
  containsUrl,
  detectPlatform,
  extractUrls,
  isSingleUrl,
  type SocialUrlContext,
} from '@/lib/social-url';
import {
  checkAiAllowance,
  consumeAiAllowance,
  getPlan,
  readSubscriptionState,
  readUsageState,
  writeUsageState,
  type LimitCheck,
  type SubscriptionState,
  type UsageState,
} from '@/lib/subscriptions';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  buildSessionAnalysisContext,
  debugSocialVault,
  getSessionForUrl,
  hasAuthArtifacts,
  readJson,
  readVault,
  SETTINGS_KEY,
  socialPlatforms,
  type SocialId,
  type SocialSession,
  writeJson,
} from '@/lib/social-vault';

const MAX_INPUT_LENGTH = 5000;
const MIN_URL_ANALYSIS_MS = 5200;
const TERMS_VERSION = '2026-04-26';

WebBrowser.maybeCompleteAuthSession();

type ThemeMode = 'system' | 'white' | 'dark' | 'auto';
type ActiveView = 'analyze' | 'settings';
type AnalysisMode = 'ai';
type ToastType = 'success' | 'warning' | 'error' | 'info';
type AuthMode = 'signin' | 'signup' | 'reset';

type AppSettings = {
  language: Language;
  themeMode: ThemeMode;
};

type ToastMessage = {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
};

type ProfileTermsState = {
  termsAcceptedAt: string | null;
  termsVersion: string | null;
};

type VerificationSource = {
  title: string;
  subtitle: string;
  url: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

type Palette = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  muted: string;
  border: string;
  chip: string;
  ink: string;
  inkText: string;
  accent: string;
  accentSoft: string;
  panel: string;
  panelMuted: string;
  panelBorder: string;
  panelText: string;
  panelMutedText: string;
};

const riskColor: Record<RiskLevel, string> = {
  faible: '#11A36A',
  moyen: '#D97706',
  eleve: '#E5484D',
};

const toastVisuals: Record<
  ToastType,
  {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    colors: [string, string, string];
    accent: string;
  }
> = {
  success: {
    icon: 'check-decagram-outline',
    colors: ['#10251E', '#0F5F46', '#11A36A'],
    accent: '#7CFFCB',
  },
  warning: {
    icon: 'alert-outline',
    colors: ['#251A09', '#8A4B0A', '#F59E0B'],
    accent: '#FFE08A',
  },
  error: {
    icon: 'close-octagon-outline',
    colors: ['#2A0E13', '#8F1D2C', '#E5484D'],
    accent: '#FFD6DA',
  },
  info: {
    icon: 'auto-fix',
    colors: ['#10172A', '#1D4ED8', '#38BDF8'],
    accent: '#DBEAFE',
  },
};

const settingsCopy = {
  en: {
    analyze: 'Analyze',
    settings: 'Settings',
    clipboardReady: 'Clipboard signal detected.',
    clipboardUrlReady: 'Social URL detected in clipboard.',
    paste: 'Paste',
    pasteFull: 'Paste from clipboard',
    settingsEyebrow: 'Secure enrichment layer',
    settingsTitle: 'Settings',
    settingsIntro:
      'Connect social sources through an in-app session vault. The MVP stores only local encrypted session records until a platform grants access.',
    language: 'Language',
    theme: 'Appearance',
    system: 'System',
    white: 'White',
    dark: 'Dark',
    auto: 'Auto',
    socialVault: 'Social session vault',
    socialVaultNote:
      'Cookies, localStorage and sessionStorage must come from a consented in-app login flow. The app cannot read other native apps or external browsers.',
    connect: 'Connect',
    disconnect: 'Disconnect',
    connected: 'Connected',
    notConnected: 'Not connected',
    vaultPrepared: 'Encrypted vault ready',
    sessionWindow: 'Session window',
    storageScope: 'SecureStore slot: cookies + localStorage + sessionStorage metadata',
    privacyTitle: 'Privacy boundary',
    privacyBody:
      'Content stays on device for the MVP. Social sessions are scoped, revocable and should expire with each platform authorization window.',
  },
  fr: {
    analyze: 'Analyse',
    settings: 'Parametres',
    clipboardReady: 'Signal detecte dans le presse-papier.',
    clipboardUrlReady: 'URL sociale detectee dans le presse-papier.',
    paste: 'Coller',
    pasteFull: 'Coller depuis le presse-papier',
    settingsEyebrow: 'Couche d’enrichissement securisee',
    settingsTitle: 'Parametres',
    settingsIntro:
      'Connecte les sources sociales via un coffre de session in-app. Le MVP stocke seulement des sessions locales chiffrees tant qu’une plateforme autorise l’acces.',
    language: 'Langue',
    theme: 'Apparence',
    system: 'Systeme',
    white: 'White',
    dark: 'Dark',
    auto: 'Auto',
    socialVault: 'Coffre de sessions sociales',
    socialVaultNote:
      'Les cookies, localStorage et sessionStorage doivent venir d’un login in-app consenti. L’app ne peut pas lire les autres apps natives ou navigateurs externes.',
    connect: 'Connecter',
    disconnect: 'Deconnecter',
    connected: 'Connecte',
    notConnected: 'Non connecte',
    vaultPrepared: 'Coffre chiffre pret',
    sessionWindow: 'Fenetre de session',
    storageScope: 'Slot SecureStore: metadata cookies + localStorage + sessionStorage',
    privacyTitle: 'Limite privacy',
    privacyBody:
      'Le contenu reste sur le telephone pour le MVP. Les sessions sociales sont limitees, revocables et doivent expirer selon chaque plateforme.',
  },
} satisfies Record<Language, Record<string, string>>;

const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#F6F8FC',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    text: '#111318',
    muted: '#334155',
    border: '#CBD5E1',
    chip: '#E2E8F0',
    ink: '#111318',
    inkText: '#FFFFFF',
    accent: '#2563EB',
    accentSoft: '#DBEAFE',
    panel: '#111318',
    panelMuted: '#182230',
    panelBorder: '#3B4556',
    panelText: '#FFFFFF',
    panelMutedText: '#CBD5E1',
  },
  dark: {
    bg: '#080B12',
    surface: '#111827',
    surfaceMuted: '#1E293B',
    text: '#F8FAFC',
    muted: '#CBD5E1',
    border: '#334155',
    chip: '#243044',
    ink: '#F8FAFC',
    inkText: '#0F172A',
    accent: '#38BDF8',
    accentSoft: '#123145',
    panel: '#0F172A',
    panelMuted: '#111C2D',
    panelBorder: '#334155',
    panelText: '#F8FAFC',
    panelMutedText: '#CBD5E1',
  },
};

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveTheme(themeMode: ThemeMode, systemScheme: 'light' | 'dark' | null | undefined) {
  if (themeMode === 'dark') {
    return 'dark';
  }

  if (themeMode === 'white') {
    return 'light';
  }

  if (themeMode === 'auto') {
    const hour = new Date().getHours();
    return hour >= 20 || hour < 7 ? 'dark' : 'light';
  }

  return systemScheme === 'dark' ? 'dark' : 'light';
}

function getAnalysisSteps(language: Language, platform: string) {
  if (language === 'fr') {
    return [
      `1/4 Identification de la source ${platform}...`,
      '2/4 Recuperation des metadonnees publiques...',
      '3/4 Recherche de signaux visibles et commentaires publics...',
      '4/4 Calcul du score avec les limites de session...',
    ];
  }

  return [
    `1/4 Identifying ${platform} source...`,
    '2/4 Fetching public metadata...',
    '3/4 Looking for visible signals and public comments...',
    '4/4 Scoring with session limits...',
  ];
}

function formatAttemptsForLog(context: SocialUrlContext) {
  return context.attempts.map((attempt) => ({
    source: attempt.source,
    ok: attempt.ok,
    status: attempt.status ?? null,
    elapsedMs: attempt.elapsedMs,
    extractedCharacters: attempt.extractedCharacters,
    error: attempt.error ?? null,
  }));
}

function formatLimitNotice(limit: LimitCheck, language: Language) {
  if (language === 'fr') {
    if (limit.reason === 'subscription_required') {
      if (limit.plan.id === 'free') {
        return `Limite gratuite atteinte: 3 analyses IA par mois. Reset: ${new Date(limit.nextMonthlyResetAt).toLocaleDateString()}.`;
      }

      return 'Les analyses IA avancees demandent un abonnement actif.';
    }

    if (limit.reason === 'monthly_analysis_limit') {
      return `Limite mensuelle atteinte. Reset: ${new Date(limit.nextMonthlyResetAt).toLocaleDateString()}.`;
    }

    if (limit.reason === 'hourly_limit') {
      return `Limite horaire atteinte. Reset: ${new Date(limit.nextHourlyResetAt).toLocaleTimeString()}.`;
    }

    if (limit.reason === 'weekly_budget_limit') {
      return `Credits hebdomadaires atteints. Reset: ${new Date(limit.nextWeeklyResetAt).toLocaleDateString()}.`;
    }

    return `Limite hebdomadaire atteinte. Reset: ${new Date(limit.nextWeeklyResetAt).toLocaleDateString()}.`;
  }

  if (limit.reason === 'subscription_required') {
    if (limit.plan.id === 'free') {
      return `Free limit reached: 3 AI analyses per month. Reset: ${new Date(limit.nextMonthlyResetAt).toLocaleDateString()}.`;
    }

    return 'Advanced AI analysis requires an active subscription.';
  }

  if (limit.reason === 'monthly_analysis_limit') {
    return `Monthly limit reached. Reset: ${new Date(limit.nextMonthlyResetAt).toLocaleDateString()}.`;
  }

  if (limit.reason === 'hourly_limit') {
    return `Hourly limit reached. Reset: ${new Date(limit.nextHourlyResetAt).toLocaleTimeString()}.`;
  }

  if (limit.reason === 'weekly_budget_limit') {
    return `Weekly credits reached. Reset: ${new Date(limit.nextWeeklyResetAt).toLocaleDateString()}.`;
  }

  return `Weekly limit reached. Reset: ${new Date(limit.nextWeeklyResetAt).toLocaleDateString()}.`;
}

function formatAiErrorNotice(error: unknown, language: Language) {
  const backendUrl = getBackendUrl();
  const isLocalhostBackend = /localhost|127\.0\.0\.1/i.test(backendUrl);
  const code = error instanceof AdvancedAiRequestError ? error.code : 'unknown_error';
  const status = error instanceof AdvancedAiRequestError ? error.status : undefined;

  if (language === 'fr') {
    if (code === 'backend_not_configured') {
      return "Analyse IA non lancee: aucun backend n'est configure dans EXPO_PUBLIC_BD_BACKEND_URL.";
    }

    if (code === 'ai_gateway_key_missing') {
      return 'Analyse IA non lancee: la cle AI Gateway manque cote backend.';
    }

    if (code === 'direct_gateway_key_missing') {
      return 'Analyse IA directe activee, mais EXPO_PUBLIC_AI_GATEWAY_API_KEY est manquante. Attention: cette cle sera publique dans l’app.';
    }

    if (code === 'network_error') {
      return isLocalhostBackend
        ? "Analyse IA inaccessible: l'app pointe vers localhost. Sur iPhone, utilise une URL Vercel publique ou l'IP locale du Mac avec un backend lance."
        : "Analyse IA inaccessible: le backend n'a pas repondu. Verifie l'URL backend et les logs Vercel.";
    }

    if (code === 'quota_exceeded' || status === 402) {
      return 'Limite IA atteinte. Passe a un abonnement superieur ou attends le prochain reset.';
    }

    return `Analyse IA non disponible${status ? ` (HTTP ${status})` : ''}: ${code}.`;
  }

  if (code === 'backend_not_configured') {
    return 'AI analysis did not run: no backend is configured in EXPO_PUBLIC_BD_BACKEND_URL.';
  }

  if (code === 'ai_gateway_key_missing') {
    return 'AI analysis did not run: AI Gateway key is missing on the backend.';
  }

  if (code === 'direct_gateway_key_missing') {
    return 'Direct AI mode is enabled, but EXPO_PUBLIC_AI_GATEWAY_API_KEY is missing. Warning: this key is public in the app.';
  }

  if (code === 'network_error') {
    return isLocalhostBackend
      ? 'AI analysis is unreachable: the app points to localhost. On iPhone, use a public Vercel URL or the Mac local IP with a running backend.'
      : 'AI analysis is unreachable: the backend did not respond. Check the backend URL and Vercel logs.';
  }

  if (code === 'quota_exceeded' || status === 402) {
    return 'AI limit reached. Upgrade your plan or wait for the next reset.';
  }

  return `AI analysis unavailable${status ? ` (HTTP ${status})` : ''}: ${code}.`;
}

function toDisplayItems(items: unknown): string[] {
  if (Array.isArray(items)) {
    return items.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof items === 'string' && items.trim()) {
    return [items.trim()];
  }

  return [];
}

function buildVerificationSources(
  aiResult: AdvancedAiAnalysis,
  urlContext: SocialUrlContext | null,
  language: Language,
): VerificationSource[] {
  const claim = aiResult.extracted?.main_claim || aiResult.summary;
  const query = buildVerificationQuery(claim, urlContext);
  const sources: VerificationSource[] = [];
  const originalUrl = aiResult.context?.original_url || aiResult.context?.source_url;

  if (originalUrl && /^https?:\/\//i.test(originalUrl) && originalUrl !== urlContext?.url) {
    sources.push({
      title: language === 'fr' ? 'Source probable' : 'Likely source',
      subtitle: aiResult.context?.source_name || (language === 'fr' ? 'URL detectee par IA' : 'AI-detected URL'),
      url: originalUrl,
      icon: 'source-branch',
    });
  }

  if (urlContext?.url) {
    sources.push({
      title: language === 'fr' ? 'Publication originale' : 'Original post',
      subtitle: urlContext.platform,
      url: urlContext.url,
      icon: 'open-in-new',
    });
  }

  if (urlContext?.platform === 'X / Twitter') {
    sources.push({
      title: language === 'fr' ? 'Recherche X en direct' : 'Live X search',
      subtitle: language === 'fr' ? 'Retrouver replies, reposts et contexte public' : 'Find replies, reposts and public context',
      url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`,
      icon: 'alpha-x-box-outline',
    });
  }

  aiResult.context?.economical_queries?.slice(0, 2).forEach((subQuery, index) => {
    sources.push({
      title: language === 'fr' ? `Recherche ciblee ${index + 1}` : `Targeted search ${index + 1}`,
      subtitle: subQuery,
      url: `https://www.google.com/search?q=${encodeURIComponent(subQuery)}`,
      icon: 'target',
    });
  });

  sources.push(
    {
      title: language === 'fr' ? 'Recherche exacte' : 'Exact search',
      subtitle: language === 'fr' ? 'Retrouver la source ou les reprises du contenu' : 'Find the source or reposts of the content',
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${query.slice(0, 160)}"`)}`,
      icon: 'magnify',
    },
    {
      title: language === 'fr' ? 'Actualites' : 'News search',
      subtitle: language === 'fr' ? 'Comparer avec des medias indexes' : 'Compare with indexed news outlets',
      url: `https://www.google.com/search?tbm=nws&q=${encodeURIComponent(query)}`,
      icon: 'newspaper-variant-outline',
    },
    {
      title: language === 'fr' ? 'Sources fiables' : 'Reliable sources',
      subtitle: language === 'fr' ? 'Reuters, AP, AFP, fact-checking' : 'Reuters, AP, AFP, fact-checking',
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} Reuters OR AP OR AFP OR fact check`)}`,
      icon: 'shield-search',
    },
  );

  return sources;
}

function buildVerificationQuery(claim: string, urlContext: SocialUrlContext | null) {
  const raw = claim || urlContext?.summary || urlContext?.description || urlContext?.title || urlContext?.url || '';
  const cleaned = raw
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || urlContext?.url || 'verification source';
}

function buildQuestionSuggestions(content: string, language: Language) {
  const topic = extractQuestionTopic(content);

  if (language === 'fr') {
    return [
      `Est-ce que ${topic} est vrai ?`,
      `Quelle est la source originale de ${topic} ?`,
      `Qu'est-ce qui manque pour verifier ${topic} ?`,
    ];
  }

  return [
    `Is ${topic} true?`,
    `What is the original source for ${topic}?`,
    `What context is missing to verify ${topic}?`,
  ];
}

function extractQuestionTopic(content: string) {
  const cleaned = content
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'cette publication';
  }

  const candidate = cleaned
    .replace(/[🚨🇺🇸🔥✅❌]/g, '')
    .replace(/\b(ALERTE INFO|BREAKING|URGENT|EXCLUSIF)\b/gi, '')
    .trim()
    .slice(0, 120);

  return candidate || 'cette publication';
}

function buildAiOnlyDetectionResult(aiResult: AdvancedAiAnalysis, analysisInput: string, language: Language): DetectionResult {
  const redFlags = [
    ...toDisplayItems(aiResult.extracted?.bullshit_signals),
    ...toDisplayItems(aiResult.extracted?.missing_context),
    ...toDisplayItems(aiResult.flags),
  ]
    .map((signal) => `${language === 'fr' ? 'IA' : 'AI'}: ${signal}`)
    .slice(0, 6);
  const suggestion =
    aiResult.suggested_checks[0] ??
    (language === 'fr'
      ? 'Compare avec une source primaire avant de prendre une decision.'
      : 'Compare with a primary source before making a decision.');

  return {
    score: aiResult.score,
    risk: mapAiRiskToLocal(aiResult.risk_level),
    explanation: aiResult.human_explanation || aiResult.reason || aiResult.summary,
    redFlags:
      redFlags.length > 0
        ? redFlags
        : [
            language === 'fr'
              ? 'IA: aucun signal net, conclusion a confirmer avec des sources.'
              : 'AI: no strong signal, conclusion should be checked against sources.',
          ],
    suggestion,
    debug: {
      analyzedCharacters: analysisInput.trim().length,
      matchedSignals: [],
      penalties: {
        matchedSignals: 0,
        urlOnly: 0,
        upperCasePressure: 0,
        excessivePunctuation: 0,
        lengthAdjustment: 0,
        total: 0,
      },
      inputPreview: analysisInput.trim().slice(0, 900),
    },
  };
}

function mapAiRiskToLocal(riskLevel: AdvancedAiAnalysis['risk_level']): RiskLevel {
  if (riskLevel === 'high') {
    return 'eleve';
  }

  if (riskLevel === 'low') {
    return 'faible';
  }

  return 'moyen';
}

export default function HomeScreen() {
  const systemScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeView, setActiveView] = useState<ActiveView>('analyze');
  const [language, setLanguage] = useState<Language>('en');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [content, setContent] = useState('');
  const [clipboardValue, setClipboardValue] = useState('');
  const [sessions, setSessions] = useState<Record<SocialId, SocialSession>>({} as Record<SocialId, SocialSession>);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [limitNotice, setLimitNotice] = useState('');
  const [aiErrorNotice, setAiErrorNotice] = useState('');
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [advancedAi, setAdvancedAi] = useState<AdvancedAiAnalysis | null>(null);
  const [urlContext, setUrlContext] = useState<SocialUrlContext | null>(null);
  const [commentIndex, setCommentIndex] = useState(0);
  const [shareNotice, setShareNotice] = useState(translations.en.localNotice);
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode | null>(null);
  const [questionModalVisible, setQuestionModalVisible] = useState(false);
  const [verificationQuestion, setVerificationQuestion] = useState('');
  const [analysisStep, setAnalysisStep] = useState('');
  const [aiPressed, setAiPressed] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [profileTerms, setProfileTerms] = useState<ProfileTermsState>({
    termsAcceptedAt: null,
    termsVersion: null,
  });
  const fade = useRef(new Animated.Value(0)).current;
  const aiPulse = useRef(new Animated.Value(0)).current;
  const gatePulse = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-18)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = translations[language];
  const s = settingsCopy[language];
  const resolvedTheme = resolveTheme(themeMode, systemScheme);
  const palette = palettes[resolvedTheme];
  const examples = examplesByLanguage[language];
  const remainingCharacters = MAX_INPUT_LENGTH - content.length;
  const buttonDisabled = content.length > MAX_INPUT_LENGTH;
  const inputMode = isSingleUrl(content.trim()) ? t.urlMode : containsUrl(content) ? t.combinedMode : t.textMode;
  const scorePercent = `${result?.score ?? 0}%` as DimensionValue;
  const pasteLabel = width < 390 ? s.paste : s.pasteFull;
  const connectedCount = Object.values(sessions).filter((session) => session.connected).length;
  const sourcePillMessage = isAnalyzingUrl && analysisStep ? analysisStep : shareNotice;
  const activePlan = getPlan(subscription?.planId ?? 'free');
  const hasAiAccess = true;
  const isAnalyzing = analysisMode !== null || isAnalyzingUrl;
  const supabaseReady = isSupabaseConfigured();
  const hasAcceptedCurrentTerms = profileTerms.termsVersion === TERMS_VERSION && Boolean(profileTerms.termsAcceptedAt);
  const appUnlocked = supabaseReady && Boolean(authSession) && hasAcceptedCurrentTerms && !passwordRecoveryActive;
  const usedCredits = activePlan.id === 'free' ? usage?.month.usedAnalyses ?? 0 : usage ? Math.round(usage.week.usedBudgetCents / 2) : 0;
  const creditLimit = activePlan.id === 'free' ? activePlan.monthlyAnalyses : Math.max(Math.round(activePlan.aiBudgetCentsWeekly / 2), 0);
  const creditPercent =
    creditLimit > 0
      ? Math.min(Math.round((usedCredits / creditLimit) * 100), 100)
      : 0;
  const riskCopy: Record<RiskLevel, string> = {
    faible: t.riskLow,
    moyen: t.riskMedium,
    eleve: t.riskHigh,
  };

  const scoreLabel = useMemo(() => {
    if (!result) {
      return t.ready;
    }

    return `${result.score}/100`;
  }, [result, t.ready]);

  const animateResult = useCallback(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const hideToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslateY, {
        toValue: -18,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  }, [toastOpacity, toastTranslateY]);

  const showToast = useCallback(
    (nextToast: Omit<ToastMessage, 'id'>) => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }

      setToast({ ...nextToast, id: Date.now() });
      toastOpacity.setValue(0);
      toastTranslateY.setValue(-18);

      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(toastTranslateY, {
          toValue: 0,
          damping: 14,
          stiffness: 160,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();

      toastTimer.current = setTimeout(() => {
        hideToast();
      }, 4200);
    },
    [hideToast, toastOpacity, toastTranslateY],
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(aiPulse, {
          toValue: 1,
          duration: 2800,
          useNativeDriver: true,
        }),
        Animated.timing(aiPulse, {
          toValue: 0,
          duration: 2800,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [aiPulse]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(gatePulse, {
          toValue: 1,
          duration: 3600,
          useNativeDriver: true,
        }),
        Animated.timing(gatePulse, {
          toValue: 0,
          duration: 3600,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [gatePulse]);

  const checkClipboard = useCallback(async () => {
    try {
      const hasText = await Clipboard.hasStringAsync();

      if (!hasText) {
        return;
      }

      const value = (await Clipboard.getStringAsync()).trim();

      if (!value || value === content.trim()) {
        return;
      }

      setClipboardValue(value.slice(0, MAX_INPUT_LENGTH));
      setShareNotice(isSingleUrl(value) ? s.clipboardUrlReady : s.clipboardReady);
    } catch {
      // Clipboard permission can be denied silently on some platforms.
    }
  }, [content, s.clipboardReady, s.clipboardUrlReady]);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const storedSettings = await readJson<AppSettings>(SETTINGS_KEY, {
          language: 'en',
          themeMode: 'system',
        });
        const storedSessions = await readVault();
        const remoteBilling = await syncBillingFromSupabase();
        const storedSubscription = remoteBilling?.subscription ?? (await readSubscriptionState());
        const storedUsage = remoteBilling?.usage ?? (await readUsageState());

        if (!mounted) {
          return;
        }

        const safeLanguage = translations[storedSettings.language] ? storedSettings.language : 'en';

        setLanguage(safeLanguage);
        setThemeMode(storedSettings.themeMode ?? 'system');
        setShareNotice(translations[safeLanguage].localNotice);
        setSessions(storedSessions);
        setSubscription(storedSubscription);
        setUsage(storedUsage);
        debugSocialVault(storedSessions, 'loaded from SecureStore');
      } catch (error) {
        console.log('[BullshitDetector] Initial load failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const refreshProfileTerms = useCallback(
    async (session: Session | null) => {
      if (!supabaseReady || !session) {
        setProfileTerms({ termsAcceptedAt: null, termsVersion: null });
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('terms_accepted_at, terms_version')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.log('[BullshitDetector] Profile terms load failed', {
          message: error.message,
        });
        setProfileTerms({ termsAcceptedAt: null, termsVersion: null });
        return;
      }

      setProfileTerms({
        termsAcceptedAt: data?.terms_accepted_at ?? null,
        termsVersion: data?.terms_version ?? null,
      });
    },
    [supabaseReady],
  );

  const handleIncomingAuthUrl = useCallback(
    async (url: string | null) => {
      if (!url || !supabaseReady) {
        return;
      }

      const authQuery = url.includes('#') ? url.replace('#', '?') : url;

      try {
        const parsedUrl = new URL(authQuery);
        const code = parsedUrl.searchParams.get('code');
        const accessToken = parsedUrl.searchParams.get('access_token');
        const refreshToken = parsedUrl.searchParams.get('refresh_token');
        const type = parsedUrl.searchParams.get('type');
        let nextSession: Session | null = null;

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          nextSession = data.session;
        } else if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          nextSession = data.session;
        }

        if (type === 'recovery') {
          setPasswordRecoveryActive(true);
          setAuthMode('reset');
          setAuthSession(nextSession);
          setAuthEmail((currentEmail) => currentEmail || nextSession?.user.email || '');
          showToast({
            type: 'info',
            title: language === 'fr' ? 'Lien de reset ouvert' : 'Reset link opened',
            message:
              language === 'fr'
                ? 'Choisis ton nouveau mot de passe pour continuer.'
                : 'Choose your new password to continue.',
          });
        } else if (nextSession) {
          setAuthSession(nextSession);
          setAuthEmail((currentEmail) => currentEmail || nextSession?.user.email || '');
          refreshProfileTerms(nextSession);
          showToast({
            type: 'success',
            title: language === 'fr' ? 'Email valide' : 'Email verified',
            message:
              language === 'fr'
                ? 'Ton compte est confirme. Accepte les conditions si necessaire.'
                : 'Your account is confirmed. Accept the terms if needed.',
          });
        }
      } catch (error) {
        showToast({
          type: 'error',
          title: language === 'fr' ? 'Lien invalide' : 'Invalid link',
          message: error instanceof Error ? error.message : language === 'fr' ? 'Impossible de lire ce lien.' : 'Unable to read this link.',
        });
      }
    },
    [language, refreshProfileTerms, showToast, supabaseReady],
  );

  useEffect(() => {
    let mounted = true;

    if (!supabaseReady) {
      return () => {
        mounted = false;
      };
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) {
        return;
      }

      if (error) {
        console.log('[BullshitDetector] Supabase session load failed', {
          message: error.message,
        });
        return;
      }

      setAuthSession(data.session);
      setAuthEmail((currentEmail) => currentEmail || data.session?.user.email || '');
      refreshProfileTerms(data.session);
    });

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthSession(session);
      setAuthEmail((currentEmail) => currentEmail || session?.user.email || '');

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryActive(true);
        setAuthMode('reset');
      }

      if (event === 'TOKEN_REFRESHED') {
        console.log('[BullshitDetector] Supabase token refreshed', {
          userId: session?.user.id ?? null,
          expiresAt: session?.expires_at ?? null,
        });
      }

      setTimeout(() => {
        refreshProfileTerms(session);
      }, 0);
    });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, [refreshProfileTerms, supabaseReady]);

  useEffect(() => {
    if (!supabaseReady) {
      return;
    }

    Linking.getInitialURL().then(handleIncomingAuthUrl).catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingAuthUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleIncomingAuthUrl, supabaseReady]);

  useEffect(() => {
    checkClipboard();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkClipboard();
      }
    });

    const clipboardSubscription =
      Platform.OS === 'web'
        ? null
        : Clipboard.addClipboardListener(() => {
            checkClipboard();
          });

    return () => {
      subscription.remove();
      clipboardSubscription?.remove();
    };
  }, [checkClipboard]);

  useEffect(() => {
    if (activeView !== 'settings') {
      return;
    }

    async function refreshSubscription() {
      try {
        const remoteBilling = await syncBillingFromSupabase();
        const [nextSubscription, nextUsage] = remoteBilling
          ? [remoteBilling.subscription, remoteBilling.usage]
          : await Promise.all([
              readSubscriptionState(),
              readUsageState(),
            ]);

        setSubscription(nextSubscription);
        setUsage(nextUsage);
      } catch (error) {
        console.log('[BullshitDetector] Settings refresh failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    refreshSubscription();
  }, [activeView]);

  useEffect(() => {
    const comments = urlContext?.comments ?? [];

    if (comments.length <= 1) {
      setCommentIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCommentIndex(Math.floor(Math.random() * comments.length));
    }, 2600);

    return () => clearInterval(interval);
  }, [urlContext?.comments]);

  async function persistSettings(nextSettings: AppSettings) {
    await writeJson(SETTINGS_KEY, nextSettings);
  }

  async function syncUsageFromServerQuota(aiResult: AdvancedAiAnalysis | null) {
    const quota = aiResult?.quota;

    if (!quota?.usage) {
      return;
    }

    const now = new Date().toISOString();
    const nextUsage: UsageState = {
      month: {
        windowStartedAt: quota.usage.month?.window_started_at ?? now,
        usedAnalyses: quota.usage.month?.used_analyses ?? 0,
        usedBudgetCents: 0,
      },
      week: {
        windowStartedAt: quota.usage.week?.window_started_at ?? now,
        usedAnalyses: quota.usage.week?.used_analyses ?? 0,
        usedBudgetCents: quota.usage.week?.used_budget_cents ?? 0,
      },
      hour: {
        windowStartedAt: quota.usage.hour?.window_started_at ?? now,
        usedAnalyses: quota.usage.hour?.used_analyses ?? 0,
        usedBudgetCents: 0,
      },
    };

    setUsage(nextUsage);
    await writeUsageState(nextUsage);
  }

  async function runAnalysis(userQuestion = '') {
    const trimmedContent = content.trim();
    const trimmedQuestion = userQuestion.trim();
    const extractedUrls = extractUrls(trimmedContent);
    const firstExtractedUrl = extractedUrls[0] ?? '';

    setUrlContext(null);
    setAdvancedAi(null);
    setLimitNotice('');
    setAiErrorNotice('');
    setAnalysisMode('ai');

    try {
      const serverBackedAi = usesSupabaseAnalyzeBackend();

      if (!trimmedContent) {
        const notice =
          language === 'fr'
            ? 'Ajoute un texte ou une URL avant de lancer l’analyse IA.'
            : 'Add text or a URL before running AI analysis.';

        setLimitNotice(notice);
        showToast({
          type: 'warning',
          title: language === 'fr' ? 'Contenu manquant' : 'Missing content',
          message: notice,
        });
        return;
      }

      showToast({
        type: 'info',
        title: language === 'fr' ? 'Analyse IA lancee' : 'AI analysis started',
        message:
          language === 'fr'
            ? 'Je recoupe le contenu avec le contexte disponible.'
            : 'Checking the content against the available context.',
      });

      const allowance = serverBackedAi ? null : await checkAiAllowance();

      if (allowance && !allowance.allowed) {
        const notice = formatLimitNotice(allowance, language);
        setLimitNotice(notice);
        showToast({
          type: 'warning',
          title: language === 'fr' ? 'Limite IA atteinte' : 'AI limit reached',
          message: notice,
        });
        router.push('/subscription');
        return;
      }

      if (isSingleUrl(trimmedContent) || firstExtractedUrl) {
        const combinedMode = Boolean(firstExtractedUrl) && !isSingleUrl(trimmedContent);
        const urlToAnalyze = combinedMode ? firstExtractedUrl : trimmedContent;
        setIsAnalyzingUrl(true);
        setAnalysisStep(
          combinedMode
            ? language === 'fr'
              ? 'Preparation de l’analyse combinee texte + URL...'
              : 'Preparing combined text + URL analysis...'
            : language === 'fr'
              ? 'Preparation de l’analyse URL...'
              : 'Preparing URL analysis...',
        );

        const startedAt = Date.now();
        const socialSession = getSessionForUrl(urlToAnalyze, sessions);
        const detectedPlatform = socialSession?.platform.label ?? detectPlatform(urlToAnalyze);
        const steps = getAnalysisSteps(language, detectedPlatform);

        setAnalysisStep(steps[0]);
        await wait(450);
        setAnalysisStep(steps[1]);

        const context = await analyzeSocialUrl(urlToAnalyze, language);

        setAnalysisStep(steps[2]);
        await wait(650);
        setUrlContext(context);
        const sessionContext = socialSession
          ? buildSessionAnalysisContext(socialSession.platform.label, socialSession.session, language)
          : undefined;

        setAnalysisStep(steps[3]);
        debugSocialVault(sessions, `before analyzing ${context.platform}`);
        console.log(combinedMode ? '[BullshitDetector] Combined text+URL analysis context' : '[BullshitDetector] URL analysis context', {
          url: context.url,
          platform: context.platform,
          mode: combinedMode ? 'combined' : 'url',
          originalTextCharacters: combinedMode ? trimmedContent.length : 0,
          extractedUrls,
          postId: context.postId,
          conversationId: context.conversationId,
          conversationIdSource: context.conversationIdSource,
          fetchedPublicContent: context.fetched,
          fetchedAt: context.fetchedAt,
          extractedCharacters: {
            title: context.title.length,
            description: context.description.length,
            summary: context.summary.length,
            visibleText: context.visibleText.length,
            commentsSummary: context.commentsSummary.length,
            comments: context.comments.join(' ').length,
          },
          commentsFound: context.comments.length,
          comments: context.comments,
          attempts: formatAttemptsForLog(context),
          connectedSession: Boolean(socialSession?.session?.connected),
          authArtifactsAvailable: hasAuthArtifacts(socialSession?.session),
          sessionSource: socialSession?.session?.source ?? null,
        });

        if (context.platform === 'X / Twitter' && !context.comments.length) {
          const backendAttempt = context.attempts.find((attempt) => attempt.source === 'x-official-backend');

          console.log('[BullshitDetector] X replies integration needed', {
            postId: context.postId,
            conversationId: context.conversationId,
            conversationIdSource: context.conversationIdSource,
            backendAttempted: Boolean(backendAttempt),
            backendStatus: backendAttempt?.status ?? null,
            backendError: backendAttempt?.error ?? null,
            backendQuotaRemaining: backendAttempt?.quotaRemaining ?? null,
            backendQuotaResetAt: backendAttempt?.quotaResetAt ?? null,
            officialApiQuery: context.conversationId ? `conversation_id:${context.conversationId}` : null,
            endpoint: 'GET https://api.x.com/2/tweets/search/recent',
            requiredFields: 'tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id,public_metrics',
            note: 'Use a backend-held X API bearer token. Do not ship the token inside the mobile app.',
          });
        }

        const remainingMs = Math.max(MIN_URL_ANALYSIS_MS - (Date.now() - startedAt), 0);

        if (remainingMs > 0) {
          await wait(remainingMs);
        }

        const urlAnalysisInput = buildUrlAnalysisInput(context, language, sessionContext);
        const analysisInput = combinedMode
          ? [
              language === 'fr'
                ? 'Mode: analyse combinee texte utilisateur + URL extraite'
                : 'Mode: combined user text + extracted URL analysis',
              language === 'fr' ? `Texte fourni: ${trimmedContent}` : `Provided text: ${trimmedContent}`,
              extractedUrls.length > 1
                ? `${language === 'fr' ? 'URLs detectees' : 'Detected URLs'}: ${extractedUrls.join(' | ')}`
                : '',
              language === 'fr' ? 'Contexte public de l’URL principale:' : 'Public context from primary URL:',
              urlAnalysisInput,
            ]
              .filter(Boolean)
              .join('\n')
          : urlAnalysisInput;
        let aiResult: AdvancedAiAnalysis | null = null;

        setAnalysisStep(language === 'fr' ? 'Analyse IA avancee...' : 'Advanced AI analysis...');
        try {
          aiResult = await analyzeWithAdvancedAi({
            content: analysisInput,
            language,
            urlContext: context,
            task: combinedMode ? 'analysis' : 'research',
            userQuestion: trimmedQuestion,
            inputKind: combinedMode ? 'combined' : 'url',
          });
        } catch (error) {
          const notice = formatAiErrorNotice(error, language);
          setAiErrorNotice(notice);
          if (error instanceof AdvancedAiRequestError && error.code === 'quota_exceeded') {
            setLimitNotice(notice);
            router.push('/subscription');
          }
          showToast({
            type: 'error',
            title: language === 'fr' ? 'IA indisponible' : 'AI unavailable',
            message: notice,
          });
          return;
        }

        if (!aiResult) {
          const notice =
            language === 'fr'
              ? 'L’analyse IA n’a pas retourne de resultat exploitable.'
              : 'AI analysis did not return a usable result.';
          setAiErrorNotice(notice);
          showToast({
            type: 'error',
            title: language === 'fr' ? 'IA indisponible' : 'AI unavailable',
            message: notice,
          });
          return;
        }

        if (serverBackedAi) {
          await syncUsageFromServerQuota(aiResult);
        } else {
          const nextAllowance = await consumeAiAllowance();
          setUsage(nextAllowance.usage);
          setSubscription(await readSubscriptionState());
        }
        const finalResult = buildAiOnlyDetectionResult(aiResult, analysisInput, language);

        console.log('[BullshitDetector] AI score debug', {
          mode: 'ai',
          aiScore: aiResult.score,
          finalScore: finalResult.score,
          finalRisk: finalResult.risk,
          redFlags: finalResult.redFlags,
          analyzedCharacters: finalResult.debug.analyzedCharacters,
          analysisInputPreview: finalResult.debug.inputPreview,
        });

        setAdvancedAi(aiResult);
        setResult(finalResult);
        await saveAnalysisHistoryEntry({
          mode: 'ai',
          input: trimmedContent,
          result: finalResult,
          aiResult,
          urlContext: context,
        });
        setShareNotice(
          combinedMode
            ? language === 'fr'
              ? `${context.platform}: texte + URL analyses ensemble.`
              : `${context.platform}: text + URL analyzed together.`
            : context.fetched
              ? `${context.platform}: ${t.urlFetched}`
              : `${context.platform}: ${t.urlLimited}`,
        );
        showToast({
          type: 'success',
          title: combinedMode
            ? language === 'fr'
              ? 'Analyse combinee prete'
              : 'Combined analysis ready'
            : language === 'fr'
              ? 'Analyse prete'
              : 'Analysis ready',
          message:
            language === 'fr'
              ? 'Score genere uniquement par l’analyse IA.'
              : 'Score generated only by AI analysis.',
        });

        animateResult();
        return;
      }

      let aiResult: AdvancedAiAnalysis | null = null;

      try {
        aiResult = await analyzeWithAdvancedAi({
          content: trimmedContent,
          language,
          task: 'analysis',
          userQuestion: trimmedQuestion,
        });
      } catch (error) {
        const notice = formatAiErrorNotice(error, language);
        setAiErrorNotice(notice);
        if (error instanceof AdvancedAiRequestError && error.code === 'quota_exceeded') {
          setLimitNotice(notice);
          router.push('/subscription');
        }
        showToast({
          type: 'error',
          title: language === 'fr' ? 'IA indisponible' : 'AI unavailable',
          message: notice,
        });
        return;
      }

      if (!aiResult) {
        const notice =
          language === 'fr'
            ? 'L’analyse IA n’a pas retourne de resultat exploitable.'
            : 'AI analysis did not return a usable result.';
        setAiErrorNotice(notice);
        showToast({
          type: 'error',
          title: language === 'fr' ? 'IA indisponible' : 'AI unavailable',
          message: notice,
        });
        return;
      }

      if (serverBackedAi) {
        await syncUsageFromServerQuota(aiResult);
      } else {
        const nextAllowance = await consumeAiAllowance();
        setUsage(nextAllowance.usage);
        setSubscription(await readSubscriptionState());
      }
      const finalResult = buildAiOnlyDetectionResult(aiResult, trimmedContent, language);

      console.log('[BullshitDetector] AI score debug', {
        mode: 'ai',
        aiScore: aiResult.score,
        finalScore: finalResult.score,
        finalRisk: finalResult.risk,
        redFlags: finalResult.redFlags,
        analyzedCharacters: finalResult.debug.analyzedCharacters,
        analysisInputPreview: finalResult.debug.inputPreview,
      });

      setAdvancedAi(aiResult);
      setResult(finalResult);
      await saveAnalysisHistoryEntry({
        mode: 'ai',
        input: trimmedContent,
        result: finalResult,
        aiResult,
      });
      setShareNotice(t.manualNotice);
      showToast({
        type: 'success',
        title: language === 'fr' ? 'Analyse prete' : 'Analysis ready',
        message:
          language === 'fr'
            ? 'Le score IA est disponible.'
            : 'The AI score is ready.',
      });
      animateResult();
    } finally {
      setIsAnalyzingUrl(false);
      setAnalysisStep('');
      setAnalysisMode(null);
    }
  }

  function openAiQuestionModal() {
    Keyboard.dismiss();
    const firstSuggestion = questionSuggestions[0] ?? '';
    setVerificationQuestion(firstSuggestion);
    setQuestionModalVisible(true);
  }

  function submitAiQuestion() {
    Keyboard.dismiss();
    setQuestionModalVisible(false);
    runAnalysis(verificationQuestion);
  }

  function submitAiWithoutQuestion() {
    Keyboard.dismiss();
    setQuestionModalVisible(false);
    setVerificationQuestion('');
    runAnalysis();
  }

  function applyExample(example: string) {
    setContent(example);
    setResult(null);
    setUrlContext(null);
  }

  function updateContent(value: string) {
    setContent(value);
    setUrlContext(null);
    setAdvancedAi(null);
    setCommentIndex(0);
  }

  function pasteClipboard() {
    if (!clipboardValue) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Presse-papier vide' : 'Clipboard empty',
        message:
          language === 'fr'
            ? 'Copie un texte ou une URL avant de coller.'
            : 'Copy text or a URL before pasting.',
      });
      return;
    }

    setContent(clipboardValue);
    setUrlContext(null);
    setActiveView('analyze');
    showToast({
      type: 'success',
      title: language === 'fr' ? 'Contenu colle' : 'Content pasted',
      message: isSingleUrl(clipboardValue)
        ? language === 'fr'
          ? 'URL sociale prete a analyser.'
          : 'Social URL ready to analyze.'
        : language === 'fr'
          ? 'Texte pret a analyser.'
          : 'Text ready to analyze.',
    });
  }

  async function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setShareNotice(translations[nextLanguage].localNotice);
    setResult(null);
    setUrlContext(null);
    await persistSettings({ language: nextLanguage, themeMode });
    showToast({
      type: 'success',
      title: nextLanguage === 'fr' ? 'Langue mise a jour' : 'Language updated',
      message: nextLanguage === 'fr' ? 'Interface en francais.' : 'Interface switched to English.',
    });
  }

  async function changeThemeMode(nextMode: ThemeMode) {
    setThemeMode(nextMode);
    await persistSettings({ language, themeMode: nextMode });
    showToast({
      type: 'success',
      title: language === 'fr' ? 'Theme mis a jour' : 'Theme updated',
      message: language === 'fr' ? `Mode ${nextMode}.` : `${nextMode} mode.`,
    });
  }

  async function signInWithSupabase() {
    Keyboard.dismiss();

    if (!supabaseReady) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Supabase non configure' : 'Supabase not configured',
        message:
          language === 'fr'
            ? 'Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY puis redemarre Expo.'
            : 'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo.',
      });
      return;
    }

    if (!authEmail.trim() || !authPassword) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Champs requis' : 'Required fields',
        message:
          language === 'fr'
            ? 'Renseigne ton email et ton mot de passe.'
            : 'Enter your email and password.',
      });
      return;
    }

    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (error) {
        throw error;
      }

      if (acceptedTerms && data.session) {
        await acceptTermsForSession(data.session, false);
      } else if (data.session) {
        await refreshProfileTerms(data.session);
      }

      setAuthPassword('');
      showToast({
        type: 'success',
        title: language === 'fr' ? 'Connecte' : 'Signed in',
        message:
          language === 'fr'
            ? 'Ton compte Supabase est actif sur cet appareil.'
            : 'Your Supabase account is active on this device.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Connexion impossible' : 'Sign-in failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function signUpWithSupabase() {
    Keyboard.dismiss();

    if (!supabaseReady) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Supabase non configure' : 'Supabase not configured',
        message:
          language === 'fr'
            ? 'Ajoute les variables Supabase publiques dans .env.local.'
            : 'Add the public Supabase variables to .env.local.',
      });
      return;
    }

    if (!acceptedTerms) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Conditions requises' : 'Terms required',
        message:
          language === 'fr'
            ? 'Tu dois accepter les conditions d’utilisation avant de creer un compte.'
            : 'You must accept the terms before creating an account.',
      });
      return;
    }

    if (!authEmail.trim() || authPassword.length < 6) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Compte incomplet' : 'Incomplete account',
        message:
          language === 'fr'
            ? 'Utilise un email valide et un mot de passe de 6 caracteres minimum.'
            : 'Use a valid email and a password with at least 6 characters.',
      });
      return;
    }

    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
        options: {
          data: {
            accepted_terms_version: TERMS_VERSION,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        await acceptTermsForSession(data.session, false);
      }

      setAuthPassword('');
      showToast({
        type: 'success',
        title: language === 'fr' ? 'Compte cree' : 'Account created',
        message:
          language === 'fr'
            ? data.session
              ? 'Ton compte est actif et les conditions sont acceptees.'
              : 'Email de validation envoye. Confirme ton adresse avant de te connecter.'
            : data.session
              ? 'Your account is active and the terms are accepted.'
              : 'Validation email sent. Confirm your address before signing in.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Creation impossible' : 'Sign-up failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function resendSignupConfirmation() {
    Keyboard.dismiss();

    if (!supabaseReady || !authEmail.trim()) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Email requis' : 'Email required',
        message:
          language === 'fr'
            ? 'Renseigne ton email pour renvoyer la validation.'
            : 'Enter your email to resend validation.',
      });
      return;
    }

    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: authEmail.trim(),
      });

      if (error) {
        throw error;
      }

      showToast({
        type: 'success',
        title: language === 'fr' ? 'Email renvoye' : 'Email resent',
        message:
          language === 'fr'
            ? 'Regarde ta boite mail et tes spams.'
            : 'Check your inbox and spam folder.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Renvoi impossible' : 'Resend failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function sendPasswordResetEmail() {
    Keyboard.dismiss();

    if (!supabaseReady || !authEmail.trim()) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Email requis' : 'Email required',
        message:
          language === 'fr'
            ? 'Renseigne ton email pour recevoir le lien de reset.'
            : 'Enter your email to receive the reset link.',
      });
      return;
    }

    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
        redirectTo: ExpoLinking.createURL('/'),
      });

      if (error) {
        throw error;
      }

      showToast({
        type: 'success',
        title: language === 'fr' ? 'Email de reset envoye' : 'Reset email sent',
        message:
          language === 'fr'
            ? 'Ouvre le lien depuis ton iPhone pour definir un nouveau mot de passe.'
            : 'Open the link from your iPhone to set a new password.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Reset impossible' : 'Reset failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function updateRecoveredPassword() {
    Keyboard.dismiss();

    if (!authSession) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Lien requis' : 'Link required',
        message:
          language === 'fr'
            ? 'Ouvre d’abord le lien de reset recu par email.'
            : 'Open the reset link received by email first.',
      });
      return;
    }

    if (newPassword.length < 6 || newPassword !== newPasswordConfirm) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Mot de passe invalide' : 'Invalid password',
        message:
          language === 'fr'
            ? 'Utilise 6 caracteres minimum et confirme le meme mot de passe.'
            : 'Use at least 6 characters and confirm the same password.',
      });
      return;
    }

    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      setPasswordRecoveryActive(false);
      setNewPassword('');
      setNewPasswordConfirm('');
      setAuthPassword('');
      await refreshProfileTerms(authSession);
      showToast({
        type: 'success',
        title: language === 'fr' ? 'Mot de passe mis a jour' : 'Password updated',
        message:
          language === 'fr'
            ? 'Ta session reste active, tu peux continuer.'
            : 'Your session stays active, you can continue.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Mise a jour impossible' : 'Update failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function signInWithOAuthProvider(provider: Extract<Provider, 'google' | 'facebook'>) {
    Keyboard.dismiss();

    if (!supabaseReady) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Supabase non configure' : 'Supabase not configured',
        message:
          language === 'fr'
            ? 'Ajoute les variables Supabase publiques et active le provider dans Supabase.'
            : 'Add public Supabase variables and enable the provider in Supabase.',
      });
      return;
    }

    const redirectTo = ExpoLinking.createURL('/');

    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          scopes: provider === 'facebook' ? 'email public_profile' : undefined,
          queryParams:
            provider === 'google'
              ? {
                  access_type: 'offline',
                  prompt: 'consent',
                }
              : undefined,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error(language === 'fr' ? 'URL OAuth manquante.' : 'Missing OAuth URL.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success') {
        await handleIncomingAuthUrl(result.url);
      } else if (result.type === 'cancel') {
        showToast({
          type: 'info',
          title: language === 'fr' ? 'OAuth annule' : 'OAuth cancelled',
          message:
            language === 'fr'
              ? 'La connexion sociale a ete fermee.'
              : 'The social sign-in was closed.',
        });
      }
    } catch (error) {
      showToast({
        type: 'error',
        title:
          provider === 'google'
            ? language === 'fr'
              ? 'Google indisponible'
              : 'Google unavailable'
            : language === 'fr'
              ? 'Facebook indisponible'
              : 'Facebook unavailable',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function acceptTermsForSession(session: Session, notify = true) {
    const acceptedAt = new Date().toISOString();

    const { error } = await supabase.from('profiles').upsert(
      {
        id: session.user.id,
        email: session.user.email,
        terms_accepted_at: acceptedAt,
        terms_version: TERMS_VERSION,
        updated_at: acceptedAt,
      },
      { onConflict: 'id' },
    );

    if (error) {
      throw error;
    }

    setProfileTerms({
      termsAcceptedAt: acceptedAt,
      termsVersion: TERMS_VERSION,
    });

    if (notify) {
      showToast({
        type: 'success',
        title: language === 'fr' ? 'Conditions acceptees' : 'Terms accepted',
        message:
          language === 'fr'
            ? 'Bienvenue dans Bullshit Detector.'
            : 'Welcome to Bullshit Detector.',
      });
    }
  }

  async function acceptCurrentTerms() {
    Keyboard.dismiss();

    if (!authSession) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Connexion requise' : 'Sign-in required',
        message:
          language === 'fr'
            ? 'Connecte-toi avant d’accepter les conditions.'
            : 'Sign in before accepting the terms.',
      });
      return;
    }

    if (!acceptedTerms) {
      showToast({
        type: 'warning',
        title: language === 'fr' ? 'Case a cocher' : 'Checkbox required',
        message:
          language === 'fr'
            ? 'Lis et accepte les conditions pour continuer.'
            : 'Read and accept the terms to continue.',
      });
      return;
    }

    setAuthLoading(true);

    try {
      await acceptTermsForSession(authSession);
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Acceptation impossible' : 'Accept failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOutFromSupabase() {
    Keyboard.dismiss();

    if (!supabaseReady) {
      return;
    }

    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setAuthPassword('');
      setAcceptedTerms(false);
      setPasswordRecoveryActive(false);
      setNewPassword('');
      setNewPasswordConfirm('');
      setProfileTerms({ termsAcceptedAt: null, termsVersion: null });
      showToast({
        type: 'info',
        title: language === 'fr' ? 'Deconnecte' : 'Signed out',
        message:
          language === 'fr'
            ? 'La session compte a ete fermee.'
            : 'The account session has been closed.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: language === 'fr' ? 'Erreur de deconnexion' : 'Sign-out failed',
        message: error instanceof Error ? error.message : language === 'fr' ? 'Erreur inconnue.' : 'Unknown error.',
      });
    } finally {
      setAuthLoading(false);
    }
  }

  function renderSegmentedControl() {
    return (
      <View style={[styles.viewSwitch, { backgroundColor: palette.chip, borderColor: palette.border }]}>
        {([
          ['analyze', s.analyze],
          ['settings', s.settings],
        ] as const).map(([value, label]) => {
          const selected = activeView === value;

          return (
            <Pressable
              accessibilityRole="button"
              key={value}
              onPress={() => setActiveView(value)}
              style={[styles.viewSwitchButton, selected && { backgroundColor: palette.ink }]}>
              <Text style={[styles.viewSwitchText, { color: palette.muted }, selected && { color: palette.inkText }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderCollectionProof() {
    if (!urlContext) {
      return null;
    }

    const okAttempts = urlContext.attempts.filter((attempt) => attempt.ok).length;
    const totalCharacters = urlContext.attempts.reduce(
      (total, attempt) => total + attempt.extractedCharacters,
      0,
    );

    return (
      <View style={[styles.collectionPanel, { borderColor: palette.panelBorder }]}>
        <View style={styles.collectionHeader}>
          <View>
            <Text style={[styles.collectionTitle, { color: palette.panelText }]}>
              {language === 'fr' ? 'Donnees analysees' : 'Analyzed data'}
            </Text>
            <Text style={[styles.collectionSubtitle, { color: palette.panelMutedText }]}>
              {language === 'fr'
                ? `${okAttempts}/${urlContext.attempts.length} sources publiques exploitables`
                : `${okAttempts}/${urlContext.attempts.length} usable public sources`}
            </Text>
          </View>
          <View style={[styles.characterBadge, { backgroundColor: palette.accent }]}>
            <Text style={[styles.characterBadgeText, { color: resolvedTheme === 'dark' ? '#0F172A' : '#FFFFFF' }]}>
              {totalCharacters}
            </Text>
            <Text style={[styles.characterBadgeLabel, { color: resolvedTheme === 'dark' ? '#0F172A' : '#FFFFFF' }]}>
              {language === 'fr' ? 'chars' : 'chars'}
            </Text>
          </View>
        </View>

        <View style={styles.attemptList}>
          {urlContext.attempts.map((attempt) => (
            <View key={attempt.source} style={styles.attemptRow}>
              <View
                style={[
                  styles.attemptDot,
                  { backgroundColor: attempt.ok ? '#11A36A' : '#E5484D' },
                ]}
              />
              <View style={styles.attemptBody}>
                <Text style={[styles.attemptSource, { color: palette.panelText }]}>{attempt.source}</Text>
                <Text style={[styles.attemptMeta, { color: palette.panelMutedText }]}>
                  {attempt.status ? `HTTP ${attempt.status} · ` : ''}
                  {attempt.elapsedMs}ms · {attempt.extractedCharacters}{' '}
                  {language === 'fr' ? 'caracteres' : 'characters'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function renderCommentCarousel() {
    if (!urlContext) {
      return null;
    }

    const comments = urlContext.comments;

    if (!comments.length) {
      return (
        <View style={[styles.commentCarousel, { borderColor: palette.panelBorder }]}>
          {urlContext.platform === 'X / Twitter' && urlContext.conversationId ? (
            <View style={styles.conversationBox}>
              <Text style={[styles.conversationLabel, { color: palette.panelMutedText }]}>conversation_id</Text>
              <Text style={[styles.conversationValue, { color: palette.panelText }]}>
                {urlContext.conversationId}
              </Text>
              <Text style={[styles.conversationHint, { color: palette.panelMutedText }]}>
                {urlContext.conversationIdSource === 'url-post-id'
                  ? language === 'fr'
                    ? 'Deduit depuis l’ID du post dans l’URL. A confirmer par API officielle si le post est une reponse.'
                    : 'Inferred from the post ID in the URL. Confirm with the official API if this post is a reply.'
                  : language === 'fr'
                    ? 'Non disponible sans API officielle.'
                    : 'Unavailable without the official API.'}
              </Text>
            </View>
          ) : null}
          <View style={styles.commentHeader}>
            <MaterialCommunityIcons name="comment-search-outline" size={17} color={palette.accent} />
            <Text style={[styles.commentTitle, { color: palette.panelText }]}>
              {language === 'fr' ? 'Commentaires publics' : 'Public comments'}
            </Text>
          </View>
          <Text style={[styles.commentText, { color: palette.panelMutedText }]}>
            {language === 'fr'
              ? 'Aucun commentaire public exploitable n’a ete recupere. Pour X, il faudra brancher l’API officielle avec conversation_id afin de lire les replies autorisees.'
              : 'No usable public comment was retrieved. For X, the official API with conversation_id is needed to read authorized replies.'}
          </Text>
        </View>
      );
    }

    const activeComment = comments[commentIndex % comments.length];

    return (
      <View style={[styles.commentCarousel, { borderColor: palette.panelBorder }]}>
        {urlContext.platform === 'X / Twitter' && urlContext.conversationId ? (
          <View style={styles.conversationBox}>
            <Text style={[styles.conversationLabel, { color: palette.panelMutedText }]}>conversation_id</Text>
            <Text style={[styles.conversationValue, { color: palette.panelText }]}>
              {urlContext.conversationId}
            </Text>
            <Text style={[styles.conversationHint, { color: palette.panelMutedText }]}>
              {urlContext.conversationIdSource === 'url-post-id'
                ? language === 'fr'
                  ? 'Deduit depuis l’ID du post dans l’URL.'
                  : 'Inferred from the post ID in the URL.'
                : language === 'fr'
                  ? 'Non disponible sans API officielle.'
                  : 'Unavailable without the official API.'}
            </Text>
          </View>
        ) : null}
        <View style={styles.commentHeader}>
          <MaterialCommunityIcons name="comment-text-outline" size={17} color={palette.accent} />
          <Text style={[styles.commentTitle, { color: palette.panelText }]}>
            {language === 'fr' ? 'Commentaire aleatoire' : 'Random comment'}
          </Text>
          <Text style={[styles.commentCounter, { color: palette.panelMutedText }]}>
            {commentIndex + 1}/{comments.length}
          </Text>
        </View>
        <Text style={[styles.commentText, { color: palette.panelText }]}>{activeComment}</Text>
      </View>
    );
  }

  function renderAdvancedAiPanel() {
    if (!advancedAi) {
      return null;
    }

    const extracted = advancedAi.extracted;
    const verificationSources = buildVerificationSources(advancedAi, urlContext, language);
    const aiRiskColor =
      advancedAi.risk_level === 'high'
        ? '#E5484D'
        : advancedAi.risk_level === 'medium'
          ? '#D97706'
          : '#11A36A';

    return (
      <View style={[styles.aiPanel, { backgroundColor: palette.panelMuted, borderColor: palette.panelBorder }]}>
        <View style={styles.aiPanelHeader}>
          <MaterialCommunityIcons name="auto-fix" size={18} color={palette.accent} />
          <Text style={[styles.aiPanelTitle, { color: palette.panelText }]}>Analyse IA avancee</Text>
          <View style={[styles.aiVerdictBadge, { borderColor: aiRiskColor }]}>
            <Text style={[styles.aiVerdictText, { color: aiRiskColor }]}>{advancedAi.verdict}</Text>
          </View>
        </View>

        <View style={[styles.aiHumanPanel, { borderColor: palette.panelBorder }]}>
          <View style={styles.aiHumanHeader}>
            <MaterialCommunityIcons name="message-processing-outline" size={17} color={palette.accent} />
            <Text style={[styles.aiHumanTitle, { color: palette.panelText }]}>
              {language === 'fr' ? 'Description IA' : 'AI description'}
            </Text>
          </View>
          <Text style={[styles.aiSummary, { color: palette.panelText }]}>{advancedAi.summary}</Text>
          <Text style={[styles.aiHumanText, { color: palette.panelText }]}>
            {advancedAi.human_explanation}
          </Text>
        </View>

        {extracted ? (
          <View style={[styles.aiExtractPanel, { borderColor: palette.panelBorder }]}>
            {renderAiContextFacts()}

            <View style={styles.aiExtractHeader}>
              <MaterialCommunityIcons name="file-search-outline" size={17} color={palette.accent} />
              <Text style={[styles.aiExtractTitle, { color: palette.panelText }]}>
                {language === 'fr' ? 'Essentiel extrait' : 'Extracted essentials'}
              </Text>
              <View style={[styles.aiContentTypeBadge, { borderColor: palette.panelBorder }]}>
                <Text style={[styles.aiContentTypeText, { color: palette.panelText }]}>
                  {extracted.content_type}
                </Text>
              </View>
            </View>

            <View style={styles.aiClaimBox}>
              <Text style={[styles.aiClaimLabel, { color: palette.panelMutedText }]}>
                {language === 'fr' ? 'These principale' : 'Main claim'}
              </Text>
              <Text style={[styles.aiClaimText, { color: palette.panelText }]}>
                {extracted.main_claim}
              </Text>
            </View>

            <View style={styles.aiExtractGrid}>
              <AiEvidenceColumn
                icon="shield-check-outline"
                title={language === 'fr' ? 'Signaux de veracite' : 'Veracity signals'}
                items={[...toDisplayItems(extracted.veracity_signals), ...toDisplayItems(extracted.evidence_for)].slice(0, 3)}
                empty={language === 'fr' ? 'Aucun signal solide extrait.' : 'No strong signal extracted.'}
                color="#11A36A"
                palette={palette}
              />
              <AiEvidenceColumn
                icon="alert-octagon-outline"
                title={language === 'fr' ? 'Signaux bullshit' : 'Bullshit signals'}
                items={[...toDisplayItems(extracted.bullshit_signals), ...toDisplayItems(extracted.evidence_against)].slice(0, 3)}
                empty={language === 'fr' ? 'Aucun red flag IA net.' : 'No clear AI red flag.'}
                color="#E5484D"
                palette={palette}
              />
            </View>

            <AiCompactList
              icon="format-list-bulleted"
              title={language === 'fr' ? 'Elements detectes' : 'Detected elements'}
              items={toDisplayItems(extracted.key_elements)}
              palette={palette}
            />
            <AiCompactList
              icon="image-search-outline"
              title={language === 'fr' ? 'Image / video / media' : 'Image / video / media'}
              items={toDisplayItems(extracted.media_notes)}
              palette={palette}
            />
            <AiCompactList
              icon="comment-multiple-outline"
              title={language === 'fr' ? 'Commentaires' : 'Comments'}
              items={toDisplayItems(extracted.comment_signals)}
              palette={palette}
            />
            <AiCompactList
              icon="help-circle-outline"
              title={language === 'fr' ? 'Contexte manquant' : 'Missing context'}
              items={toDisplayItems(extracted.missing_context).slice(0, 3)}
              palette={palette}
            />
          </View>
        ) : null}

        <View style={[styles.aiSourcePanel, { borderColor: palette.panelBorder }]}>
          <View style={styles.aiSourceHeader}>
            <MaterialCommunityIcons name="link-variant" size={17} color={palette.accent} />
            <Text style={[styles.aiSourceTitle, { color: palette.panelText }]}>
              {language === 'fr' ? 'Sources a consulter' : 'Sources to check'}
            </Text>
          </View>
          {verificationSources.map((source) => (
            <Pressable
              accessibilityRole="link"
              key={`${source.title}-${source.url}`}
              onPress={() => Linking.openURL(source.url).catch(() => undefined)}
              style={[styles.aiSourceRow, { borderColor: palette.panelBorder }]}>
              <MaterialCommunityIcons name={source.icon} size={17} color={palette.accent} />
              <View style={styles.aiSourceCopy}>
                <Text style={[styles.aiSourceName, { color: palette.panelText }]}>{source.title}</Text>
                <Text style={[styles.aiSourceSubtitle, { color: palette.panelMutedText }]}>{source.subtitle}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={palette.panelMutedText} />
            </Pressable>
          ))}
        </View>

        <View style={styles.aiMetricRow}>
          <View style={styles.aiMetric}>
            <Text style={[styles.aiMetricValue, { color: palette.panelText }]}>{advancedAi.score}/100</Text>
            <Text style={[styles.aiMetricLabel, { color: palette.panelMutedText }]}>score IA</Text>
          </View>
          <View style={styles.aiMetric}>
            <Text style={[styles.aiMetricValue, { color: palette.panelText }]}>
              {Math.round(advancedAi.confidence * 100)}%
            </Text>
            <Text style={[styles.aiMetricLabel, { color: palette.panelMutedText }]}>confiance</Text>
          </View>
        </View>

        {advancedAi.flags.length ? (
          <View style={styles.aiFlags}>
            {advancedAi.flags.map((flag) => (
              <View key={flag} style={[styles.aiFlag, { borderColor: palette.panelBorder }]}>
                <Text style={[styles.aiFlagText, { color: palette.panelText }]}>{flag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {advancedAi.requires_external_check ? (
          <Text style={[styles.aiExternalCheck, { color: palette.accent }]}>
            Verification externe recommandee avant conclusion.
          </Text>
        ) : null}
      </View>
    );
  }

  function renderAiContextFacts() {
    const context = advancedAi?.context;

    if (!context) {
      return null;
    }

    const facts = [
      context.source_name ? [language === 'fr' ? 'Source' : 'Source', context.source_name] : null,
      context.dates.length ? [language === 'fr' ? 'Date' : 'Date', context.dates.slice(0, 2).join(' / ')] : null,
      context.locations.length ? [language === 'fr' ? 'Lieu' : 'Location', context.locations.slice(0, 2).join(' / ')] : null,
      [language === 'fr' ? 'Contexte' : 'Context', context.context_quality],
    ].filter(Boolean) as string[][];

    if (!facts.length) {
      return null;
    }

    return (
      <View style={styles.aiFactGrid}>
        {facts.map(([label, value]) => (
          <View key={`${label}-${value}`} style={[styles.aiFactChip, { borderColor: palette.panelBorder }]}>
            <Text style={[styles.aiFactLabel, { color: palette.panelMutedText }]}>{label}</Text>
            <Text style={[styles.aiFactValue, { color: palette.panelText }]} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  function renderAiErrorPanel() {
    if (!aiErrorNotice || advancedAi) {
      return null;
    }

    return (
      <View style={[styles.aiErrorPanel, { borderColor: '#D97706', backgroundColor: palette.panelMuted }]}>
        <MaterialCommunityIcons name="cloud-alert-outline" size={20} color="#D97706" />
        <View style={styles.aiErrorBody}>
          <Text style={[styles.aiErrorTitle, { color: palette.panelText }]}>
            {language === 'fr' ? "L'analyse IA n'a pas tourne" : 'AI analysis did not run'}
          </Text>
          <Text style={[styles.aiErrorText, { color: palette.panelMutedText }]}>{aiErrorNotice}</Text>
          <Text style={[styles.aiErrorMeta, { color: palette.panelMutedText }]}>
            Runtime: {getAiRuntimeLabel()}
          </Text>
        </View>
      </View>
    );
  }

  function AiEvidenceColumn({
    icon,
    title,
    items,
    empty,
    color,
    palette,
  }: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    title: string;
    items: string[];
    empty: string;
    color: string;
    palette: Palette;
  }) {
    const safeItems = items.length ? items : [empty];

    return (
      <View style={[styles.aiEvidenceCard, { borderColor: palette.panelBorder }]}>
        <View style={styles.aiEvidenceTitleRow}>
          <MaterialCommunityIcons name={icon} size={16} color={color} />
          <Text style={[styles.aiEvidenceTitle, { color: palette.panelText }]}>{title}</Text>
        </View>
        <View style={styles.aiEvidenceList}>
          {safeItems.map((item) => (
            <View key={`${title}-${item}`} style={styles.aiEvidenceItem}>
              <View style={[styles.aiEvidenceDot, { backgroundColor: color }]} />
              <Text style={[styles.aiEvidenceText, { color: palette.panelMutedText }]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function AiCompactList({
    icon,
    title,
    items,
    palette,
  }: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    title: string;
    items: string[];
    palette: Palette;
  }) {
    if (!items.length) {
      return null;
    }

    return (
      <View style={styles.aiCompactList}>
        <View style={styles.aiCompactTitleRow}>
          <MaterialCommunityIcons name={icon} size={15} color={palette.accent} />
          <Text style={[styles.aiCompactTitle, { color: palette.panelText }]}>{title}</Text>
        </View>
        {items.slice(0, 4).map((item) => (
          <Text key={`${title}-${item}`} style={[styles.aiCompactItem, { color: palette.panelMutedText }]}>
            - {item}
          </Text>
        ))}
      </View>
    );
  }

  function renderQuestionModal() {
    return (
      <Modal
        animationType="fade"
        transparent
        visible={questionModalVisible}
        onRequestClose={() => setQuestionModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.questionModal, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.questionModalHeader}>
              <View style={[styles.questionModalIcon, { backgroundColor: palette.ink }]}>
                <MaterialCommunityIcons name="target" size={21} color={palette.accent} />
              </View>
              <View style={styles.questionModalTitleWrap}>
                <Text style={[styles.questionModalTitle, { color: palette.text }]}>
                  {language === 'fr' ? 'Que veux-tu verifier ?' : 'What do you want to verify?'}
                </Text>
                <Text style={[styles.questionModalSubtitle, { color: palette.muted }]}>
                  {language === 'fr'
                    ? 'Choisis une question ou precise ton doute pour cadrer l’analyse IA.'
                    : 'Pick a question or clarify your doubt to guide the AI analysis.'}
                </Text>
              </View>
            </View>

            <View style={styles.questionSuggestionList}>
              {questionSuggestions.map((question) => (
                <Pressable
                  accessibilityRole="button"
                  key={question}
                  onPress={() => setVerificationQuestion(question)}
                  style={[
                    styles.questionSuggestion,
                    {
                      backgroundColor: verificationQuestion === question ? palette.ink : palette.surfaceMuted,
                      borderColor: verificationQuestion === question ? palette.ink : palette.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.questionSuggestionText,
                      { color: verificationQuestion === question ? palette.inkText : palette.text },
                    ]}>
                    {question}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              multiline
              onChangeText={setVerificationQuestion}
              placeholder={language === 'fr' ? 'Ex: Est-ce que cette video est authentique ?' : 'Ex: Is this video authentic?'}
              placeholderTextColor={resolvedTheme === 'dark' ? '#94A3B8' : '#64748B'}
              style={[
                styles.questionInput,
                { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
              ]}
              textAlignVertical="top"
              value={verificationQuestion}
            />

            <Pressable
              accessibilityRole="button"
              onPress={Keyboard.dismiss}
              style={[styles.keyboardDismissButton, { alignSelf: 'flex-end', borderColor: palette.border }]}>
              <MaterialCommunityIcons name="keyboard-close-outline" size={16} color={palette.muted} />
              <Text style={[styles.keyboardDismissText, { color: palette.muted }]}>
                {language === 'fr' ? 'Fermer clavier' : 'Hide keyboard'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={submitAiWithoutQuestion}
              style={[styles.questionSkipButton, { borderColor: palette.border }]}>
              <MaterialCommunityIcons name="fast-forward-outline" size={17} color={palette.muted} />
              <Text style={[styles.questionSkipText, { color: palette.muted }]}>
                {language === 'fr' ? 'Pas de question' : 'No question'}
              </Text>
            </Pressable>

            <View style={styles.questionModalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  Keyboard.dismiss();
                  setQuestionModalVisible(false);
                }}
                style={[styles.questionSecondaryButton, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                <Text style={[styles.questionSecondaryText, { color: palette.text }]}>
                  {language === 'fr' ? 'Annuler' : 'Cancel'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={submitAiQuestion}
                style={[styles.questionPrimaryButton, { backgroundColor: palette.ink }]}>
                <MaterialCommunityIcons name="send" size={17} color={palette.inkText} />
                <Text style={[styles.questionPrimaryText, { color: palette.inkText }]}>
                  {language === 'fr' ? 'Envoyer' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderAnalyze() {
    return (
      <>
        {renderQuestionModal()}
        <View style={[styles.inputBlock, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ShareSourcePill loading={isAnalyzingUrl} message={sourcePillMessage} />

          {clipboardValue ? (
            <Pressable
              accessibilityRole="button"
              onPress={pasteClipboard}
              style={[styles.clipboardButton, { backgroundColor: palette.ink }]}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={18} color={palette.inkText} />
              <Text style={[styles.clipboardButtonText, { color: palette.inkText }]}>{pasteLabel}</Text>
            </Pressable>
          ) : null}

          <View style={styles.inputHeader}>
            <View style={styles.inputTitleRow}>
              <MaterialCommunityIcons name="radar" size={18} color={palette.text} />
              <Text style={[styles.label, { color: palette.text }]}>{t.inputLabel}</Text>
            </View>
            <View style={[styles.modeBadge, { backgroundColor: palette.ink }]}>
              <Text style={[styles.modeBadgeText, { color: palette.accent }]}>{inputMode}</Text>
            </View>
          </View>

          <View style={styles.counterRow}>
            <Text style={[styles.counter, { color: palette.muted }, remainingCharacters < 250 && styles.counterWarning]}>
              {remainingCharacters} {t.characters}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={Keyboard.dismiss}
              style={[styles.keyboardDismissButton, { borderColor: palette.border }]}>
              <MaterialCommunityIcons name="keyboard-close-outline" size={16} color={palette.muted} />
              <Text style={[styles.keyboardDismissText, { color: palette.muted }]}>
                {language === 'fr' ? 'Fermer clavier' : 'Hide keyboard'}
              </Text>
            </Pressable>
          </View>

          <TextInput
            multiline
            maxLength={MAX_INPUT_LENGTH}
            onChangeText={updateContent}
            placeholder={t.placeholder}
            placeholderTextColor={resolvedTheme === 'dark' ? '#7C8794' : '#8A8F98'}
            style={[
              styles.textInput,
              {
                backgroundColor: palette.surfaceMuted,
                borderColor: palette.border,
                color: palette.text,
              },
            ]}
            textAlignVertical="top"
            value={content}
          />

          <View style={styles.exampleRow}>
            {examples.map((example, index) => (
              <Pressable
                accessibilityRole="button"
                key={example}
                onPress={() => applyExample(example)}
                style={[styles.exampleButton, { backgroundColor: palette.chip, borderColor: palette.border }]}>
                <Text style={[styles.exampleText, { color: palette.text }]}>
                  {t.example} {index + 1}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actionStack}>
            <Pressable
              accessibilityRole="button"
              disabled={buttonDisabled || isAnalyzing}
              onPress={() => (hasAiAccess ? openAiQuestionModal() : router.push('/subscription'))}
              onPressIn={() => setAiPressed(true)}
              onPressOut={() => setAiPressed(false)}
              style={[
                styles.aiAnalyzeButton,
                aiPressed && styles.analyzeButtonPressed,
                (buttonDisabled || isAnalyzing) && styles.disabledButton,
              ]}>
              <LinearGradient
                colors={['#1D4ED8', '#7C3AED', '#E11D48', '#F59E0B']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: aiGradientOpacity }]}>
                <LinearGradient
                  colors={['#0F766E', '#2563EB', '#A855F7', '#F43F5E']}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.aiShine,
                  {
                    opacity: aiShineOpacity,
                    transform: [{ translateX: aiShineTranslateX }, { rotate: '12deg' }],
                  },
                ]}
              />
              <View style={styles.aiContrastLayer} />
              <View style={styles.aiAnalyzeContent}>
                <View style={styles.aiAnalyzeIcon}>
                  <MaterialCommunityIcons
                    name={aiButtonBusy ? 'progress-clock' : hasAiAccess ? 'auto-fix' : 'lock-open-variant-outline'}
                    size={22}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.aiAnalyzeCopy}>
                  <Text style={styles.aiAnalyzeTitle}>{aiButtonBusy ? t.analyzingUrl : aiAnalyzeLabel}</Text>
                  <Text style={styles.aiAnalyzeSubtitle}>{aiAnalyzeSubtitle}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.88)" />
              </View>
            </Pressable>
          </View>
        </View>

        <Animated.View
          style={[
            styles.resultBlock,
            { backgroundColor: palette.panel },
            result && {
              opacity: fade,
              transform: [
                {
                  translateY: fade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}>
          <View style={styles.scoreHeader}>
            <View style={styles.scoreCopy}>
              <Text style={[styles.resultLabel, { color: palette.panelMutedText }]}>{t.reliabilityScore}</Text>
              <Text style={[styles.score, { color: palette.panelText }]}>{scoreLabel}</Text>
              <Text style={[styles.scoreHint, { color: palette.panelMutedText }]}>{t.scoreHint}</Text>
            </View>

            {result ? (
              <View style={[styles.riskBadge, { borderColor: riskColor[result.risk] }]}>
                <View style={[styles.riskDot, { backgroundColor: riskColor[result.risk] }]} />
                <Text style={[styles.riskText, { color: riskColor[result.risk] }]}>
                  {riskCopy[result.risk]}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.meterTrack, { backgroundColor: palette.panelMuted }]}>
            <View
              style={[
                styles.meterFill,
                {
                  width: scorePercent,
                  backgroundColor: result ? riskColor[result.risk] : palette.panelBorder,
                },
              ]}
            />
          </View>

          {result ? (
            <View style={styles.resultDetails}>
              {urlContext ? (
                <View
                  style={[
                    styles.urlContextBox,
                    { backgroundColor: palette.panelMuted, borderColor: palette.panelBorder },
                  ]}>
                  <Text style={[styles.contextTitle, { color: palette.accent }]}>
                    {urlContext.platform}
                  </Text>
                  <Text style={[styles.contextText, { color: palette.panelText }]}>{urlContext.summary}</Text>
                  {urlContext.commentsSummary ? (
                    <Text style={[styles.contextMuted, { color: palette.panelMutedText }]}>
                      {t.comments}: {urlContext.commentsSummary}
                    </Text>
                  ) : (
                    <Text style={[styles.contextMuted, { color: palette.panelMutedText }]}>{urlContext.limitation}</Text>
                  )}
                  {renderCommentCarousel()}
                  {renderCollectionProof()}
                </View>
              ) : null}

              <Text style={[styles.explanation, { color: palette.panelText }]}>{result.explanation}</Text>
              {renderAdvancedAiPanel()}
              {renderAiErrorPanel()}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.panelText }]}>{t.redFlags}</Text>
                {result.redFlags.map((flag) => (
                  <View key={flag} style={styles.flagRow}>
                    <View style={[styles.flagBullet, { backgroundColor: palette.accent }]} />
                    <Text style={[styles.flagText, { color: palette.panelText }]}>{flag}</Text>
                  </View>
                ))}
              </View>

              <View
                style={[styles.suggestionBox, { backgroundColor: palette.panelMuted, borderColor: palette.panelBorder }]}>
                <Text style={[styles.sectionTitle, { color: palette.panelText }]}>{t.suggestion}</Text>
                <Text style={[styles.suggestionText, { color: palette.panelText }]}>{result.suggestion}</Text>
              </View>
            </View>
          ) : (
            <View
              style={[styles.emptyStateBox, { backgroundColor: palette.panelMuted, borderColor: palette.panelBorder }]}>
              <MaterialCommunityIcons name="text-search" size={26} color={palette.accent} />
              <Text style={[styles.emptyTitle, { color: palette.panelText }]}>{t.emptyTitle}</Text>
              <Text style={[styles.emptyState, { color: palette.panelMutedText }]}>{t.emptyResult}</Text>
            </View>
          )}
        </Animated.View>
      </>
    );
  }

  function renderSettings() {
    return (
      <View style={styles.settingsWrap}>
        <View style={[styles.settingsHero, { backgroundColor: palette.panel }]}>
          <View style={[styles.settingsIcon, { backgroundColor: palette.accent }]}>
            <MaterialCommunityIcons name="database-lock-outline" size={24} color={resolvedTheme === 'dark' ? '#0F172A' : '#FFFFFF'} />
          </View>
          <Text style={[styles.settingsEyebrow, { color: palette.accent }]}>{s.settingsEyebrow}</Text>
          <Text style={[styles.settingsTitle, { color: palette.panelText }]}>{s.settingsTitle}</Text>
          <Text style={[styles.settingsIntro, { color: palette.panelMutedText }]}>{s.settingsIntro}</Text>
          <View style={[styles.connectedMeter, { borderColor: palette.panelBorder }]}>
            <Text style={[styles.connectedNumber, { color: palette.panelText }]}>
              {connectedCount}/{socialPlatforms.length}
            </Text>
            <Text style={[styles.connectedLabel, { color: palette.panelMutedText }]}>{s.vaultPrepared}</Text>
          </View>
        </View>

        <View style={[styles.settingSection, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.accountHeader}>
            <View style={[styles.accountIcon, { backgroundColor: palette.ink }]}>
              <MaterialCommunityIcons name="shield-account-outline" size={21} color={palette.inkText} />
            </View>
            <View style={styles.accountHeaderCopy}>
              <Text style={[styles.settingSectionTitle, { color: palette.text }]}>
                {language === 'fr' ? 'Compte utilisateur' : 'User account'}
              </Text>
              <Text style={[styles.settingNote, { color: palette.muted }]}>
                {language === 'fr'
                  ? 'Base Supabase pour synchroniser plus tard les credits, abonnements et droits premium.'
                  : 'Supabase foundation for syncing credits, subscriptions and premium entitlements later.'}
              </Text>
            </View>
          </View>

          {!supabaseReady ? (
            <View style={[styles.accountNotice, { backgroundColor: palette.accentSoft, borderColor: palette.border }]}>
              <MaterialCommunityIcons name="database-alert-outline" size={18} color={palette.text} />
              <Text style={[styles.accountNoticeText, { color: palette.text }]}>
                {language === 'fr'
                  ? 'Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env.local, puis relance Expo.'
                  : 'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart Expo.'}
              </Text>
            </View>
          ) : authSession ? (
            <View style={[styles.accountSignedCard, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
              <View style={styles.accountSignedCopy}>
                <Text style={[styles.accountStatus, { color: '#11A36A' }]}>
                  {language === 'fr' ? 'Session active' : 'Active session'}
                </Text>
                <Text style={[styles.accountEmail, { color: palette.text }]} numberOfLines={1}>
                  {authSession.user.email ?? authSession.user.id}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={authLoading}
                onPress={signOutFromSupabase}
                style={[styles.accountSmallButton, { backgroundColor: palette.chip, opacity: authLoading ? 0.55 : 1 }]}>
                <MaterialCommunityIcons name="logout" size={15} color={palette.text} />
                <Text style={[styles.accountSmallButtonText, { color: palette.text }]}>
                  {language === 'fr' ? 'Sortir' : 'Sign out'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.accountForm}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setAuthEmail}
                placeholder={language === 'fr' ? 'email@exemple.com' : 'email@example.com'}
                placeholderTextColor={palette.muted}
                returnKeyType="next"
                style={[
                  styles.accountInput,
                  { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
                ]}
                value={authEmail}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setAuthPassword}
                placeholder={language === 'fr' ? 'Mot de passe' : 'Password'}
                placeholderTextColor={palette.muted}
                returnKeyType="done"
                secureTextEntry
                style={[
                  styles.accountInput,
                  { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
                ]}
                value={authPassword}
              />
              <View style={styles.accountActionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={authLoading}
                  onPress={signUpWithSupabase}
                  style={[
                    styles.accountSecondaryButton,
                    { backgroundColor: palette.chip, borderColor: palette.border, opacity: authLoading ? 0.55 : 1 },
                  ]}>
                  <Text style={[styles.accountSecondaryText, { color: palette.text }]}>
                    {language === 'fr' ? 'Creer' : 'Create'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={authLoading}
                  onPress={signInWithSupabase}
                  style={[styles.accountPrimaryButton, { backgroundColor: palette.ink, opacity: authLoading ? 0.55 : 1 }]}>
                  <MaterialCommunityIcons name="login" size={16} color={palette.inkText} />
                  <Text style={[styles.accountPrimaryText, { color: palette.inkText }]}>
                    {authLoading
                      ? language === 'fr'
                        ? 'Patiente...'
                        : 'Wait...'
                      : language === 'fr'
                        ? 'Se connecter'
                        : 'Sign in'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.settingSection, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.subscriptionRow}>
            <View style={styles.subscriptionCopy}>
              <Text style={[styles.settingSectionTitle, { color: palette.text }]}>
                {language === 'fr' ? 'Abonnement IA' : 'AI subscription'}
              </Text>
              <Text style={[styles.settingNote, { color: palette.muted }]}>
                {activePlan.name} · {usedCredits}/{creditLimit} credits · {creditPercent}%{' '}
                {language === 'fr' ? 'cette semaine' : 'this week'}
              </Text>
              {limitNotice ? (
                <Text style={[styles.limitNoticeText, { color: '#D97706' }]}>{limitNotice}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/subscription')}
              style={[styles.subscriptionButton, { backgroundColor: palette.ink }]}>
              <MaterialCommunityIcons name="credit-card-outline" size={16} color={palette.inkText} />
              <Text style={[styles.subscriptionButtonText, { color: palette.inkText }]}>
                {language === 'fr' ? 'Voir' : 'View'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.settingSection, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.settingSectionTitle, { color: palette.text }]}>{s.language}</Text>
          <View style={styles.optionRow}>
            {(['en', 'fr'] as const).map((option) => {
              const selected = language === option;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={option}
                  onPress={() => changeLanguage(option)}
                  style={[
                    styles.optionButton,
                    { backgroundColor: selected ? palette.ink : palette.chip, borderColor: palette.border },
                  ]}>
                  <Text style={[styles.optionText, { color: selected ? palette.inkText : palette.text }]}>
                    {option.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.settingSectionTitle, { color: palette.text, marginTop: 18 }]}>{s.theme}</Text>
          <View style={styles.optionGrid}>
            {([
              ['system', s.system, 'theme-light-dark'],
              ['white', s.white, 'white-balance-sunny'],
              ['dark', s.dark, 'moon-waning-crescent'],
              ['auto', s.auto, 'auto-fix'],
            ] as const).map(([mode, label, icon]) => {
              const selected = themeMode === mode;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={mode}
                  onPress={() => changeThemeMode(mode)}
                  style={[
                    styles.themeButton,
                    { backgroundColor: selected ? palette.ink : palette.chip, borderColor: palette.border },
                  ]}>
                  <MaterialCommunityIcons
                    name={icon}
                    size={17}
                    color={selected ? palette.inkText : palette.text}
                  />
                  <Text style={[styles.themeButtonText, { color: selected ? palette.inkText : palette.text }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.settingSection, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.settingSectionTitle, { color: palette.text }]}>{s.socialVault}</Text>
              <Text style={[styles.settingNote, { color: palette.muted }]}>{s.socialVaultNote}</Text>
            </View>
          </View>

          <View style={styles.socialList}>
            {socialPlatforms.map((platform) => {
              const session = sessions[platform.id];
              const connected = Boolean(session?.connected);

              return (
                <View
                  key={platform.id}
                  style={[styles.socialRow, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                  <View style={[styles.socialIcon, { backgroundColor: connected ? platform.accent : palette.chip }]}>
                    <MaterialCommunityIcons name={platform.icon} size={20} color="#111318" />
                  </View>
                  <View style={styles.socialBody}>
                    <Text style={[styles.socialName, { color: palette.text }]}>{platform.label}</Text>
                    <Text style={[styles.socialMeta, { color: palette.muted }]}>
                      {connected ? s.connected : s.notConnected}
                    </Text>
                    {connected && session.expiresAt ? (
                      <Text style={[styles.socialMeta, { color: palette.muted }]}>
                        {s.sessionWindow}: {new Date(session.expiresAt).toLocaleDateString()}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/connector/[id]',
                        params: { id: platform.id },
                      })
                    }
                    style={[styles.connectButton, { backgroundColor: connected ? palette.chip : palette.ink }]}>
                    <MaterialCommunityIcons
                      name={connected ? 'shield-check-outline' : 'login'}
                      size={15}
                      color={connected ? palette.text : palette.inkText}
                    />
                    <Text style={[styles.connectText, { color: connected ? palette.text : palette.inkText }]}>
                      {s.connect}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.privacyPanel, { backgroundColor: palette.accentSoft, borderColor: palette.border }]}>
          <MaterialCommunityIcons name="cookie-lock-outline" size={22} color={palette.text} />
          <View style={styles.privacyBody}>
            <Text style={[styles.privacyPanelTitle, { color: palette.text }]}>{s.privacyTitle}</Text>
            <Text style={[styles.privacyPanelText, { color: palette.muted }]}>{s.privacyBody}</Text>
            <Text style={[styles.storageScope, { color: palette.text }]}>{s.storageScope}</Text>
          </View>
        </View>
      </View>
    );
  }

  const aiGradientOpacity = aiPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.95],
  });
  const aiShineTranslateX = aiPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 260],
  });
  const aiShineOpacity = aiPulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.05, 0.34, 0.05],
  });
  const aiButtonBusy = analysisMode === 'ai';
  const questionSuggestions = useMemo(
    () => buildQuestionSuggestions(content, language),
    [content, language],
  );
  const aiAnalyzeLabel = language === 'fr' ? "Analyser avec l'IA" : 'Analyze with AI';
  const aiAnalyzeSubtitle =
    activePlan.id === 'free'
      ? language === 'fr'
        ? `${usage?.month.usedAnalyses ?? 0}/3 analyses gratuites ce mois-ci`
        : `${usage?.month.usedAnalyses ?? 0}/3 free analyses this month`
      : language === 'fr'
        ? 'Contexte avance + resume intelligent'
        : 'Advanced context + smart summary';

  function renderAuthGate() {
    const pulseScale = gatePulse.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.04],
    });
    const pulseOpacity = gatePulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0.95],
    });
    const updatePasswordMode = passwordRecoveryActive;
    const resetRequestMode = authMode === 'reset' && !passwordRecoveryActive;
    const signedInNeedsTerms = Boolean(authSession) && !hasAcceptedCurrentTerms && !updatePasswordMode;
    const primaryLabel = updatePasswordMode
      ? language === 'fr'
        ? 'Changer le mot de passe'
        : 'Update password'
      : resetRequestMode
        ? language === 'fr'
          ? 'Envoyer le lien de reset'
          : 'Send reset link'
        : signedInNeedsTerms
      ? language === 'fr'
        ? 'Accepter et continuer'
        : 'Accept and continue'
      : authMode === 'signup'
        ? language === 'fr'
          ? 'Creer mon compte'
          : 'Create account'
        : language === 'fr'
          ? 'Se connecter'
          : 'Sign in';

    return (
      <View style={styles.authGateWrap}>
        <LinearGradient
          colors={resolvedTheme === 'dark' ? ['#070A12', '#10172A', '#123B3A'] : ['#F8FAFC', '#E0F2FE', '#ECFDF5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.authGateBg}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.authGlow,
              {
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              },
            ]}
          />

          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', android: undefined })}
            style={styles.authKeyboard}>
            <ScrollView
              contentContainerStyle={styles.authScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
          <View style={styles.authBrandBlock}>
            <View style={[styles.authLogo, { backgroundColor: palette.ink }]}>
              <MaterialCommunityIcons name="shield-search" size={28} color={palette.accent} />
            </View>
            <Text style={[styles.authEyebrow, { color: resolvedTheme === 'dark' ? '#67E8F9' : '#0F766E' }]}>
              Bullshit Detector
            </Text>
            <Text style={[styles.authTitle, { color: resolvedTheme === 'dark' ? '#FFFFFF' : '#111318' }]}>
              {language === 'fr' ? 'Analyse fiable, compte obligatoire.' : 'Reliable analysis, account required.'}
            </Text>
            <Text style={[styles.authSubtitle, { color: resolvedTheme === 'dark' ? '#CBD5E1' : '#334155' }]}>
              {language === 'fr'
                ? 'Chaque utilisateur doit etre connecte pour gerer ses credits IA, ses abonnements et l’acceptation des conditions.'
                : 'Every user must be signed in to manage AI credits, subscriptions and terms acceptance.'}
            </Text>
          </View>

          <View style={[styles.authPanel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.authPanelHeader}>
              <Text style={[styles.authPanelTitle, { color: palette.text }]}>
                {signedInNeedsTerms
                  ? language === 'fr'
                    ? 'Derniere etape'
                    : 'Final step'
                  : updatePasswordMode
                    ? language === 'fr'
                      ? 'Nouveau mot de passe'
                      : 'New password'
                    : resetRequestMode
                      ? language === 'fr'
                        ? 'Reset password'
                        : 'Password reset'
                      : authMode === 'signup'
                    ? language === 'fr'
                      ? 'Inscription'
                      : 'Create account'
                    : language === 'fr'
                      ? 'Connexion'
                      : 'Sign in'}
              </Text>
              <Text style={[styles.authPanelText, { color: palette.muted }]}>
                {signedInNeedsTerms
                  ? language === 'fr'
                    ? 'Ton email est valide. Accepte les conditions pour ouvrir l’app.'
                    : 'Your email is valid. Accept the terms to open the app.'
                  : updatePasswordMode
                    ? language === 'fr'
                      ? 'Definis un nouveau mot de passe. La session restera active.'
                      : 'Set a new password. Your session will stay active.'
                    : resetRequestMode
                      ? language === 'fr'
                        ? 'Entre ton email, puis ouvre le lien recu pour revenir ici.'
                        : 'Enter your email, then open the received link to come back here.'
                      : language === 'fr'
                    ? 'Supabase Auth protege ton acces et preparera les abonnements natifs.'
                    : 'Supabase Auth protects access and prepares native subscriptions.'}
              </Text>
            </View>

            {!supabaseReady ? (
              <View style={[styles.authWarning, { backgroundColor: palette.accentSoft, borderColor: palette.border }]}>
                <MaterialCommunityIcons name="database-alert-outline" size={18} color={palette.text} />
                <Text style={[styles.authWarningText, { color: palette.text }]}>
                  {language === 'fr'
                    ? 'Configure EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY pour activer les comptes.'
                    : 'Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable accounts.'}
                </Text>
              </View>
            ) : null}

            {!authSession || resetRequestMode ? (
              <>
                {!resetRequestMode ? (
                  <View style={[styles.authModeSwitch, { backgroundColor: palette.chip }]}>
                    {(['signin', 'signup'] as const).map((mode) => {
                      const selected = authMode === mode;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={mode}
                          onPress={() => setAuthMode(mode)}
                          style={[styles.authModeButton, selected && { backgroundColor: palette.ink }]}>
                          <Text style={[styles.authModeText, { color: selected ? palette.inkText : palette.text }]}>
                            {mode === 'signin'
                              ? language === 'fr'
                                ? 'Connexion'
                                : 'Sign in'
                              : language === 'fr'
                                ? 'Inscription'
                                : 'Sign up'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {!resetRequestMode ? (
                  <View style={styles.oauthStack}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={authLoading}
                      onPress={() => signInWithOAuthProvider('google')}
                      style={[styles.oauthButton, { borderColor: palette.border, backgroundColor: palette.surfaceMuted, opacity: authLoading ? 0.55 : 1 }]}>
                      <MaterialCommunityIcons name="google" size={18} color="#EA4335" />
                      <Text style={[styles.oauthButtonText, { color: palette.text }]}>
                        {language === 'fr' ? 'Continuer avec Google' : 'Continue with Google'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={authLoading}
                      onPress={() => signInWithOAuthProvider('facebook')}
                      style={[styles.oauthButton, { borderColor: palette.border, backgroundColor: palette.surfaceMuted, opacity: authLoading ? 0.55 : 1 }]}>
                      <MaterialCommunityIcons name="facebook" size={20} color="#1877F2" />
                      <Text style={[styles.oauthButtonText, { color: palette.text }]}>
                        {language === 'fr' ? 'Continuer avec Facebook' : 'Continue with Facebook'}
                      </Text>
                    </Pressable>
                    <View style={styles.authDividerRow}>
                      <View style={[styles.authDividerLine, { backgroundColor: palette.border }]} />
                      <Text style={[styles.authDividerText, { color: palette.muted }]}>
                        {language === 'fr' ? 'ou email' : 'or email'}
                      </Text>
                      <View style={[styles.authDividerLine, { backgroundColor: palette.border }]} />
                    </View>
                  </View>
                ) : null}

                <View style={styles.authInputStack}>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setAuthEmail}
                    placeholder={language === 'fr' ? 'email@exemple.com' : 'email@example.com'}
                    placeholderTextColor={palette.muted}
                    returnKeyType="next"
                    style={[
                      styles.authInput,
                      { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
                    ]}
                    value={authEmail}
                  />
                  {!resetRequestMode ? (
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setAuthPassword}
                      placeholder={language === 'fr' ? 'Mot de passe' : 'Password'}
                      placeholderTextColor={palette.muted}
                      returnKeyType="done"
                      secureTextEntry
                      style={[
                        styles.authInput,
                        { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
                      ]}
                      value={authPassword}
                    />
                  ) : null}
                </View>

                <View style={styles.authLinkRow}>
                  {authMode === 'signin' ? (
                    <Pressable accessibilityRole="button" onPress={() => setAuthMode('reset')} style={styles.authTextButton}>
                      <Text style={[styles.authTextButtonLabel, { color: palette.accent }]}>
                        {language === 'fr' ? 'Mot de passe oublie ?' : 'Forgot password?'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {resetRequestMode ? (
                    <Pressable accessibilityRole="button" onPress={() => setAuthMode('signin')} style={styles.authTextButton}>
                      <Text style={[styles.authTextButtonLabel, { color: palette.accent }]}>
                        {language === 'fr' ? 'Retour connexion' : 'Back to sign in'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : (
              <View style={styles.authInputStack}>
                <View style={[styles.authSignedStrip, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                  <MaterialCommunityIcons name="email-check-outline" size={19} color="#10B981" />
                  <Text style={[styles.authSignedText, { color: palette.text }]} numberOfLines={1}>
                    {authSession.user.email ?? authSession.user.id}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={signOutFromSupabase} style={styles.authTinyButton}>
                    <Text style={[styles.authTinyButtonText, { color: palette.muted }]}>
                      {language === 'fr' ? 'Changer' : 'Switch'}
                    </Text>
                  </Pressable>
                </View>

                {updatePasswordMode ? (
                  <>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setNewPassword}
                      placeholder={language === 'fr' ? 'Nouveau mot de passe' : 'New password'}
                      placeholderTextColor={palette.muted}
                      returnKeyType="next"
                      secureTextEntry
                      style={[
                        styles.authInput,
                        { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
                      ]}
                      value={newPassword}
                    />
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setNewPasswordConfirm}
                      placeholder={language === 'fr' ? 'Confirmer le mot de passe' : 'Confirm password'}
                      placeholderTextColor={palette.muted}
                      returnKeyType="done"
                      secureTextEntry
                      style={[
                        styles.authInput,
                        { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text },
                      ]}
                      value={newPasswordConfirm}
                    />
                  </>
                ) : null}
              </View>
            )}

            {!resetRequestMode && !updatePasswordMode ? (
              <>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedTerms }}
                  onPress={() => setAcceptedTerms((value) => !value)}
                  style={[styles.termsCheckRow, { borderColor: acceptedTerms ? palette.accent : palette.border }]}>
                  <View style={[styles.termsBox, { backgroundColor: acceptedTerms ? palette.accent : 'transparent', borderColor: palette.border }]}>
                    {acceptedTerms ? <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={[styles.termsCheckText, { color: palette.text }]}>
                    {language === 'fr'
                      ? `J’accepte les conditions d’utilisation Bullshit Detector v${TERMS_VERSION}.`
                      : `I accept Bullshit Detector terms of use v${TERMS_VERSION}.`}
                  </Text>
                </Pressable>

                <View style={[styles.termsBoxPanel, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                  {[
                    language === 'fr'
                      ? 'L’analyse est une aide a l’evaluation, pas une preuve definitive.'
                      : 'Analysis is an evaluation aid, not definitive proof.',
                    language === 'fr'
                      ? 'Tu restes responsable de verifier les sources avant toute decision importante.'
                      : 'You remain responsible for checking sources before important decisions.',
                    language === 'fr'
                      ? 'Les contenus sensibles, secrets, mots de passe et donnees bancaires ne doivent pas etre colles dans l’app.'
                      : 'Sensitive content, secrets, passwords and banking data must not be pasted into the app.',
                    language === 'fr'
                      ? 'Les credits IA gratuits sont limites a 3 analyses par mois; les abus peuvent etre bloques.'
                      : 'Free AI credits are limited to 3 analyses per month; abuse may be blocked.',
                  ].map((item) => (
                    <View key={item} style={styles.termsBulletRow}>
                      <View style={[styles.termsBullet, { backgroundColor: palette.accent }]} />
                      <Text style={[styles.termsBulletText, { color: palette.muted }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={authLoading || !supabaseReady}
              onPress={
                updatePasswordMode
                  ? updateRecoveredPassword
                  : resetRequestMode
                    ? sendPasswordResetEmail
                    : signedInNeedsTerms
                      ? acceptCurrentTerms
                      : authMode === 'signup'
                        ? signUpWithSupabase
                        : signInWithSupabase
              }
              style={[styles.authPrimaryButton, { opacity: authLoading || !supabaseReady ? 0.55 : 1 }]}>
              <LinearGradient
                colors={['#2563EB', '#7C3AED', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.authPrimaryGradient}>
                <MaterialCommunityIcons name={authLoading ? 'progress-clock' : 'arrow-right-circle'} size={20} color="#FFFFFF" />
                <Text style={styles.authPrimaryText}>
                  {authLoading ? (language === 'fr' ? 'Patiente...' : 'Wait...') : primaryLabel}
                </Text>
              </LinearGradient>
            </Pressable>

            {!authSession && !resetRequestMode ? (
              <Pressable accessibilityRole="button" onPress={resendSignupConfirmation} style={styles.resendButton}>
                <MaterialCommunityIcons name="email-sync-outline" size={16} color={palette.accent} />
                <Text style={[styles.resendText, { color: palette.accent }]}>
                  {language === 'fr' ? 'Renvoyer l’email de validation' : 'Resend validation email'}
                </Text>
              </Pressable>
            ) : null}
          </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </View>
    );
  }

  function renderToast() {
    if (!toast) {
      return null;
    }

    const visual = toastVisuals[toast.type];

    return (
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.toastShell,
          {
            left: Math.max(insets.left + 16, 16),
            opacity: toastOpacity,
            right: Math.max(insets.right + 16, 16),
            top: Math.max(insets.top + 12, 24),
            transform: [{ translateY: toastTranslateY }],
          },
        ]}>
        <Pressable accessibilityRole="button" onPress={hideToast} style={styles.toastPressable}>
          <LinearGradient colors={visual.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toastCard}>
            <View style={[styles.toastIcon, { borderColor: visual.accent }]}>
              <MaterialCommunityIcons name={visual.icon} size={20} color={visual.accent} />
            </View>
            <View style={styles.toastCopy}>
              <Text style={styles.toastTitle}>{toast.title}</Text>
              {toast.message ? <Text style={styles.toastMessage}>{toast.message}</Text> : null}
            </View>
            <MaterialCommunityIcons name="close" size={17} color="rgba(255,255,255,0.82)" />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  if (!appUnlocked) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
        {renderToast()}
        {renderAuthGate()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
      {renderToast()}
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={[styles.privacyPill, { backgroundColor: palette.ink }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={14} color={palette.accent} />
                <Text style={[styles.privacyText, { color: palette.inkText }]}>{t.privacyTag}</Text>
              </View>
              <View style={[styles.languageSwitch, { backgroundColor: palette.chip }]}>
                {(['en', 'fr'] as const).map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    key={option}
                    onPress={() => changeLanguage(option)}
                    style={[styles.languageButton, language === option && { backgroundColor: palette.ink }]}>
                    <Text
                      style={[
                        styles.languageButtonText,
                        { color: palette.muted },
                        language === option && { color: palette.inkText },
                      ]}>
                      {option.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>
              {t.eyebrow}
            </Text>
            <Text style={[styles.title, { color: palette.text }]}>Bullshit Detector</Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>{t.subtitle}</Text>
            <View style={styles.platformRow}>
              {socialPlatforms.slice(0, 4).map((platform) => (
                <View
                  key={platform.id}
                  style={[styles.platformChip, { backgroundColor: palette.chip, borderColor: palette.border }]}>
                  <Text style={[styles.platformChipText, { color: palette.text }]}>{platform.label}</Text>
                </View>
              ))}
            </View>
            {renderSegmentedControl()}
          </View>

          {activeView === 'analyze' ? renderAnalyze() : renderSettings()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  toastShell: {
    left: 16,
    position: 'absolute',
    right: 16,
    top: 8,
    zIndex: 50,
  },
  toastPressable: {
    borderRadius: 18,
  },
  toastCard: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 8,
  },
  toastIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  toastCopy: {
    flex: 1,
    gap: 2,
  },
  toastTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  toastMessage: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  authGateWrap: {
    flex: 1,
  },
  authGateBg: {
    flex: 1,
    overflow: 'hidden',
    padding: 20,
  },
  authKeyboard: {
    flex: 1,
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  authGlow: {
    backgroundColor: 'rgba(56,189,248,0.22)',
    borderRadius: 999,
    height: 280,
    position: 'absolute',
    right: -110,
    top: 72,
    width: 280,
  },
  authBrandBlock: {
    gap: 8,
    marginBottom: 18,
  },
  authLogo: {
    alignItems: 'center',
    borderRadius: 18,
    height: 54,
    justifyContent: 'center',
    marginBottom: 4,
    width: 54,
  },
  authEyebrow: {
    fontSize: 13,
    fontWeight: '900',
  },
  authTitle: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  authSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  authPanel: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 8,
  },
  authPanelHeader: {
    gap: 5,
  },
  authPanelTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  authPanelText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  authWarning: {
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  authWarningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  authModeSwitch: {
    borderRadius: 14,
    flexDirection: 'row',
    padding: 4,
  },
  authModeButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  authModeText: {
    fontSize: 14,
    fontWeight: '900',
  },
  oauthStack: {
    gap: 9,
  },
  oauthButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  oauthButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  authDividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
  },
  authDividerText: {
    fontSize: 12,
    fontWeight: '900',
  },
  authInputStack: {
    gap: 10,
  },
  authLinkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 28,
  },
  authTextButton: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  authTextButtonLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  authInput: {
    borderRadius: 15,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800',
    minHeight: 50,
    paddingHorizontal: 13,
  },
  authSignedStrip: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  authSignedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  authTinyButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  authTinyButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  termsCheckRow: {
    alignItems: 'flex-start',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  termsBox: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  termsCheckText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
  },
  termsBoxPanel: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  termsBulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  termsBullet: {
    borderRadius: 999,
    height: 6,
    marginTop: 7,
    width: 6,
  },
  termsBulletText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  authPrimaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  authPrimaryGradient: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  authPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  resendButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 8,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '900',
  },
  keyboard: {
    flex: 1,
  },
  content: {
    gap: 20,
    padding: 20,
    paddingBottom: 44,
  },
  header: {
    gap: 12,
    paddingTop: 10,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '900',
  },
  privacyPill: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  privacyText: {
    fontSize: 13,
    fontWeight: '900',
  },
  languageSwitch: {
    borderRadius: 12,
    flexDirection: 'row',
    padding: 3,
  },
  languageButton: {
    borderRadius: 9,
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  languageButtonText: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 45,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  platformChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  platformChipText: {
    fontSize: 13,
    fontWeight: '900',
  },
  viewSwitch: {
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 4,
    padding: 4,
  },
  viewSwitchButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  viewSwitchText: {
    fontSize: 14,
    fontWeight: '900',
  },
  inputBlock: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: '#111318',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 3,
  },
  clipboardButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  clipboardButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  inputHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  inputTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
  },
  modeBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  modeBadgeText: {
    fontSize: 13,
    fontWeight: '900',
  },
  counterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  counter: {
    fontSize: 13,
    fontWeight: '800',
  },
  keyboardDismissButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  keyboardDismissText: {
    fontSize: 12,
    fontWeight: '900',
  },
  counterWarning: {
    color: '#D97706',
  },
  textInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 180,
    padding: 14,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleButton: {
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  exampleText: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionStack: {
    gap: 10,
  },
  analyzeButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54,
    transform: [{ scale: 1 }],
  },
  analyzeButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  disabledButton: {
    opacity: 0.55,
  },
  analyzeButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  aiAnalyzeButton: {
    borderRadius: 18,
    minHeight: 68,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    transform: [{ scale: 1 }],
    elevation: 5,
  },
  aiShine: {
    backgroundColor: '#FFFFFF',
    bottom: -18,
    left: -70,
    position: 'absolute',
    top: -18,
    width: 72,
  },
  aiContrastLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,19,24,0.34)',
  },
  aiAnalyzeContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  aiAnalyzeIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.26)',
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  aiAnalyzeCopy: {
    flex: 1,
  },
  aiAnalyzeTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  aiAnalyzeSubtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 2,
  },
  resultBlock: {
    borderRadius: 20,
    gap: 18,
    padding: 20,
  },
  scoreHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  scoreCopy: {
    flex: 1,
    paddingRight: 8,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  score: {
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 48,
  },
  scoreHint: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 2,
  },
  riskBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  riskDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  riskText: {
    fontSize: 14,
    fontWeight: '900',
  },
  meterTrack: {
    borderRadius: 999,
    height: 9,
    overflow: 'hidden',
  },
  meterFill: {
    borderRadius: 999,
    height: '100%',
    minWidth: 8,
  },
  resultDetails: {
    gap: 18,
  },
  urlContextBox: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  contextTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  contextText: {
    fontSize: 15,
    lineHeight: 22,
  },
  contextMuted: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentCarousel: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
    marginTop: 4,
    padding: 12,
  },
  commentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  commentTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  commentCounter: {
    fontSize: 12,
    fontWeight: '800',
  },
  commentText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  conversationBox: {
    gap: 3,
  },
  conversationLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  conversationValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  conversationHint: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  aiPanel: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  aiPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  aiPanelTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  aiVerdictBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  aiVerdictText: {
    fontSize: 12,
    fontWeight: '900',
  },
  aiSummary: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  aiReason: {
    fontSize: 14,
    lineHeight: 21,
  },
  aiHumanPanel: {
    borderRadius: 15,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  aiHumanHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  aiHumanTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  aiHumanText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  aiExtractPanel: {
    borderRadius: 15,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  aiExtractHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  aiExtractTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  aiContentTypeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  aiContentTypeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  aiClaimBox: {
    gap: 3,
  },
  aiClaimLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  aiClaimText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  aiExtractGrid: {
    gap: 9,
  },
  aiFactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aiFactChip: {
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: '48%',
    gap: 2,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  aiFactLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  aiFactValue: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  aiEvidenceCard: {
    borderRadius: 13,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  aiEvidenceTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  aiEvidenceTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  aiEvidenceList: {
    gap: 7,
  },
  aiEvidenceItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
  },
  aiEvidenceDot: {
    borderRadius: 99,
    height: 6,
    marginTop: 6,
    width: 6,
  },
  aiEvidenceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  aiCompactList: {
    gap: 5,
  },
  aiCompactTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  aiCompactTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  aiCompactItem: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,11,18,0.62)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  questionModal: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    maxWidth: 520,
    padding: 18,
    width: '100%',
  },
  questionModalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  questionModalIcon: {
    alignItems: 'center',
    borderRadius: 15,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  questionModalTitleWrap: {
    flex: 1,
    gap: 4,
  },
  questionModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  questionModalSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  questionSuggestionList: {
    gap: 8,
  },
  questionSuggestion: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  questionSuggestionText: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
  },
  questionInput: {
    borderRadius: 15,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    minHeight: 82,
    padding: 12,
  },
  questionSkipButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  questionSkipText: {
    fontSize: 13,
    fontWeight: '900',
  },
  questionModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  questionSecondaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  questionSecondaryText: {
    fontSize: 14,
    fontWeight: '900',
  },
  questionPrimaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  questionPrimaryText: {
    fontSize: 14,
    fontWeight: '900',
  },
  aiSourcePanel: {
    borderRadius: 15,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  aiSourceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  aiSourceTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  aiSourceRow: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  aiSourceCopy: {
    flex: 1,
  },
  aiSourceName: {
    fontSize: 13,
    fontWeight: '900',
  },
  aiSourceSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 1,
  },
  aiMetricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  aiMetric: {
    flex: 1,
  },
  aiMetricValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  aiMetricLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  aiFlags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  aiFlag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  aiFlagText: {
    fontSize: 12,
    fontWeight: '900',
  },
  aiExternalCheck: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  aiErrorPanel: {
    alignItems: 'flex-start',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  aiErrorBody: {
    flex: 1,
    gap: 4,
  },
  aiErrorTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  aiErrorText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  aiErrorMeta: {
    fontSize: 12,
    fontWeight: '800',
  },
  collectionPanel: {
    borderTopWidth: 1,
    gap: 12,
    marginTop: 4,
    paddingTop: 12,
  },
  collectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  collectionTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  collectionSubtitle: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 2,
  },
  characterBadge: {
    alignItems: 'center',
    borderRadius: 12,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  characterBadgeText: {
    fontSize: 15,
    fontWeight: '900',
  },
  characterBadgeLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  attemptList: {
    gap: 9,
  },
  attemptRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  attemptDot: {
    borderRadius: 999,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  attemptBody: {
    flex: 1,
  },
  attemptSource: {
    fontSize: 13,
    fontWeight: '900',
  },
  attemptMeta: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 1,
  },
  explanation: {
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  flagRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  flagBullet: {
    borderRadius: 999,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  flagText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  suggestionBox: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  suggestionText: {
    fontSize: 15,
    lineHeight: 22,
  },
  emptyStateBox: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyState: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  settingsWrap: {
    gap: 14,
  },
  settingsHero: {
    borderRadius: 22,
    gap: 10,
    padding: 18,
  },
  settingsIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  settingsEyebrow: {
    fontSize: 12,
    fontWeight: '900',
  },
  settingsTitle: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  settingsIntro: {
    fontSize: 14,
    lineHeight: 21,
  },
  connectedMeter: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    padding: 12,
  },
  connectedNumber: {
    fontSize: 20,
    fontWeight: '900',
  },
  connectedLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  settingSection: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  settingSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  settingNote: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  accountHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  accountIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  accountHeaderCopy: {
    flex: 1,
  },
  accountNotice: {
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  accountNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  accountSignedCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  accountSignedCopy: {
    flex: 1,
    gap: 2,
  },
  accountStatus: {
    fontSize: 12,
    fontWeight: '900',
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: '900',
  },
  accountSmallButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  accountSmallButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  accountForm: {
    gap: 10,
  },
  accountInput: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  accountActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accountSecondaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 0.85,
    minHeight: 48,
    justifyContent: 'center',
  },
  accountSecondaryText: {
    fontSize: 14,
    fontWeight: '900',
  },
  accountPrimaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1.25,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  accountPrimaryText: {
    fontSize: 14,
    fontWeight: '900',
  },
  subscriptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  subscriptionCopy: {
    flex: 1,
  },
  limitNoticeText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 6,
  },
  subscriptionButton: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  subscriptionButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '900',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeButton: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexBasis: '48%',
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    justifyContent: 'center',
  },
  themeButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  sectionHeaderRow: {
    gap: 8,
  },
  socialList: {
    gap: 10,
  },
  socialRow: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  socialIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  socialBody: {
    flex: 1,
    gap: 2,
  },
  socialName: {
    fontSize: 15,
    fontWeight: '900',
  },
  socialMeta: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  connectButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  connectText: {
    fontSize: 13,
    fontWeight: '900',
  },
  privacyPanel: {
    alignItems: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  privacyBody: {
    flex: 1,
    gap: 6,
  },
  privacyPanelTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  privacyPanelText: {
    fontSize: 13,
    lineHeight: 19,
  },
  storageScope: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
});
