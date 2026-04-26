import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { detectPlatform, type SocialPlatform } from './social-url';
import type { Language } from './i18n';

export const SETTINGS_KEY = 'bullshit-detector.settings.v1';
export const VAULT_KEY = 'bullshit-detector.social-vault.v1';

export type SocialId =
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'linkedin'
  | 'reddit'
  | 'youtube'
  | 'threads'
  | 'leboncoin';

export type SocialSession = {
  connected: boolean;
  authorizedAt?: string;
  expiresAt?: string;
  source?: 'web-browser-login-marker' | 'connector-consent-session' | 'webview-auth-bridge';
  consentAcceptedAt?: string;
  lastConnectorCheckAt?: string;
  connectorMode?: 'expo-go-preview' | 'dev-build-required' | 'dev-build-ready';
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  tokens?: Record<string, string>;
};

export type SocialPlatformConfig = {
  id: SocialId;
  label: string;
  platform: SocialPlatform;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  loginUrl: string;
  accent: string;
};

export const socialPlatforms: SocialPlatformConfig[] = [
  { id: 'tiktok', label: 'TikTok', platform: 'TikTok', icon: 'music-note-outline', loginUrl: 'https://www.tiktok.com/login', accent: '#00F2EA' },
  { id: 'instagram', label: 'Instagram', platform: 'Instagram', icon: 'instagram', loginUrl: 'https://www.instagram.com/accounts/login/', accent: '#E879F9' },
  { id: 'x', label: 'X', platform: 'X / Twitter', icon: 'alpha-x-box-outline', loginUrl: 'https://x.com/i/flow/login', accent: '#FFFFFF' },
  { id: 'facebook', label: 'Facebook', platform: 'Facebook', icon: 'facebook', loginUrl: 'https://www.facebook.com/login', accent: '#60A5FA' },
  { id: 'linkedin', label: 'LinkedIn', platform: 'LinkedIn', icon: 'linkedin', loginUrl: 'https://www.linkedin.com/login', accent: '#38BDF8' },
  { id: 'reddit', label: 'Reddit', platform: 'Reddit', icon: 'reddit', loginUrl: 'https://www.reddit.com/login/', accent: '#FF7A45' },
  { id: 'youtube', label: 'YouTube', platform: 'YouTube Shorts', icon: 'youtube', loginUrl: 'https://accounts.google.com/', accent: '#FF5A5F' },
  { id: 'threads', label: 'Threads', platform: 'Threads', icon: 'at', loginUrl: 'https://www.threads.net/login', accent: '#D1D5DB' },
  { id: 'leboncoin', label: 'Leboncoin', platform: 'Leboncoin', icon: 'storefront-outline', loginUrl: 'https://www.leboncoin.fr/compte/part/login', accent: '#FF6E14' },
];

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch (error) {
    console.log('[BullshitDetector] SecureStore read failed', {
      key,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}

export async function writeJson<T>(key: string, value: T) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch (error) {
    console.log('[BullshitDetector] SecureStore write failed', {
      key,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function readVault() {
  return readJson<Record<SocialId, SocialSession>>(VAULT_KEY, {} as Record<SocialId, SocialSession>);
}

export async function writeVault(sessions: Record<SocialId, SocialSession>) {
  await writeJson(VAULT_KEY, sessions);
}

export function getExpiryDate() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 14);
  return expiry.toISOString();
}

export function maskSecret(value?: string) {
  if (!value) {
    return null;
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

export function countRecord(value?: Record<string, string>) {
  return value ? Object.keys(value).length : 0;
}

export function hasAuthArtifacts(session?: SocialSession) {
  return Boolean(
    countRecord(session?.cookies) ||
      countRecord(session?.localStorage) ||
      countRecord(session?.sessionStorage) ||
      countRecord(session?.tokens),
  );
}

export function debugSocialVault(sessions: Record<SocialId, SocialSession>, reason: string) {
  const snapshot = socialPlatforms.map((platform) => {
    const session = sessions[platform.id];

    return {
      id: platform.id,
      label: platform.label,
      connected: Boolean(session?.connected),
      source: session?.source ?? null,
      connectorMode: session?.connectorMode ?? null,
      authorizedAt: session?.authorizedAt ?? null,
      expiresAt: session?.expiresAt ?? null,
      hasAuthArtifacts: hasAuthArtifacts(session),
      cookies: countRecord(session?.cookies),
      localStorage: countRecord(session?.localStorage),
      sessionStorage: countRecord(session?.sessionStorage),
      tokens: Object.fromEntries(
        Object.entries(session?.tokens ?? {}).map(([name, token]) => [name, maskSecret(token)]),
      ),
    };
  });

  console.log(`[BullshitDetector] Social vault snapshot: ${reason}`, snapshot);
}

export function getPlatformBySocialName(platform: SocialPlatform) {
  return socialPlatforms.find((entry) => entry.platform === platform);
}

export function getPlatformById(id?: string | string[]) {
  const platformId = Array.isArray(id) ? id[0] : id;
  return socialPlatforms.find((entry) => entry.id === platformId);
}

export function getSessionForUrl(value: string, sessions: Record<SocialId, SocialSession>) {
  const platform = getPlatformBySocialName(detectPlatform(value));
  return platform ? { platform, session: sessions[platform.id] } : null;
}

export function buildSessionAnalysisContext(
  platformLabel: string,
  session: SocialSession | undefined,
  language: Language,
) {
  if (!session?.connected) {
    return language === 'fr'
      ? `Session ${platformLabel}: aucune connexion utilisateur active dans le coffre local.`
      : `${platformLabel} session: no active user connection in the local vault.`;
  }

  if (!hasAuthArtifacts(session)) {
    return language === 'fr'
      ? `Session ${platformLabel}: connexion consentie active, mais aucun artefact officiel exploitable n'est disponible. L'analyse reste limitee aux sources publiques et aux donnees autorisees.`
      : `${platformLabel} session: consented connection is active, but no usable official artifact is available. Analysis remains limited to public and authorized data.`;
  }

  return language === 'fr'
    ? `Session ${platformLabel}: artefacts autorises presents dans le coffre local. Cookies=${countRecord(session.cookies)}, localStorage=${countRecord(session.localStorage)}, sessionStorage=${countRecord(session.sessionStorage)}, tokens=${countRecord(session.tokens)}.`
    : `${platformLabel} session: authorized artifacts are present in the local vault. Cookies=${countRecord(session.cookies)}, localStorage=${countRecord(session.localStorage)}, sessionStorage=${countRecord(session.sessionStorage)}, tokens=${countRecord(session.tokens)}.`;
}
