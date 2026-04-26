import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';

import { redirectToLoginIfNeeded } from '@/lib/auth-redirect';
import type { Language } from '@/lib/i18n';
import {
  countRecord,
  debugSocialVault,
  getExpiryDate,
  getPlatformById,
  hasAuthArtifacts,
  readJson,
  readVault,
  SETTINGS_KEY,
  type SocialId,
  type SocialSession,
  writeVault,
} from '@/lib/social-vault';

type AppSettings = {
  language: Language;
  themeMode: 'system' | 'white' | 'dark' | 'auto';
};

const copy = {
  en: {
    back: 'Back',
    secureConnector: 'Secure connector',
    intro:
      'Connect this source with explicit consent. The MVP stores only a local encrypted connector state until an official API or dev-build WebView bridge is available.',
    consentTitle: 'Consent required',
    consentBody:
      'I understand this connector must use authorized data only. Session secrets are not printed in logs and are not exported.',
    start: 'Start secure session',
    disconnect: 'Disconnect',
    connected: 'Connected',
    notConnected: 'Not connected',
    session: 'Session',
    diagnostics: 'Diagnostics',
    authArtifacts: 'Authorized artifacts',
    cookies: 'Cookies',
    localStorage: 'Local storage',
    sessionStorage: 'Session storage',
    tokens: 'Tokens',
    devBuild: 'Dev build bridge',
    devBuildBody:
      'Expo Go cannot embed the controlled WebView bridge needed for platform-specific authorized enrichment. This screen prepares the vault state and the next build step.',
    ready: 'Connector ready for dev build',
    pending: 'Pending',
    opened: 'Login opened. Connector state saved locally.',
  },
  fr: {
    back: 'Retour',
    secureConnector: 'Connecteur securise',
    intro:
      'Connecte cette source avec consentement explicite. Le MVP stocke seulement un etat local chiffre tant qu’une API officielle ou un bridge WebView dev build n’est pas disponible.',
    consentTitle: 'Consentement requis',
    consentBody:
      'Je comprends que ce connecteur doit utiliser seulement des donnees autorisees. Les secrets de session ne sont pas affiches dans les logs et ne sont pas exportes.',
    start: 'Demarrer la session securisee',
    disconnect: 'Deconnecter',
    connected: 'Connecte',
    notConnected: 'Non connecte',
    session: 'Session',
    diagnostics: 'Diagnostic',
    authArtifacts: 'Artefacts autorises',
    cookies: 'Cookies',
    localStorage: 'Local storage',
    sessionStorage: 'Session storage',
    tokens: 'Tokens',
    devBuild: 'Bridge dev build',
    devBuildBody:
      'Expo Go ne peut pas embarquer le bridge WebView controle necessaire a l’enrichissement autorise par plateforme. Cet ecran prepare le coffre et la prochaine etape de build.',
    ready: 'Connecteur pret pour dev build',
    pending: 'En attente',
    opened: 'Login ouvert. Etat du connecteur sauvegarde localement.',
  },
} satisfies Record<Language, Record<string, string>>;

export default function ConnectorScreen() {
  const { id } = useLocalSearchParams<{ id: SocialId }>();
  const platform = getPlatformById(id);
  const [language, setLanguage] = useState<Language>('en');
  const [session, setSession] = useState<SocialSession | undefined>();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [notice, setNotice] = useState('');
  const t = copy[language];

  const artifactCount = useMemo(
    () =>
      countRecord(session?.cookies) +
      countRecord(session?.localStorage) +
      countRecord(session?.sessionStorage) +
      countRecord(session?.tokens),
    [session],
  );
  const connected = Boolean(session?.connected);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        await redirectToLoginIfNeeded();
        const settings = await readJson<AppSettings>(SETTINGS_KEY, {
          language: 'en',
          themeMode: 'system',
        });
        const vault = await readVault();

        if (!mounted) {
          return;
        }

        setLanguage(settings.language);

        if (platform) {
          const currentSession = vault[platform.id];
          setSession(currentSession);
          setConsentAccepted(Boolean(currentSession?.consentAcceptedAt));
        }
      } catch (error) {
        console.log('[BullshitDetector] Connector load failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [platform]);

  if (!platform) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.title}>Connector unavailable</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  async function startSecureSession() {
    if (!platform || !consentAccepted) {
      return;
    }

    setIsOpening(true);

    try {
      await WebBrowser.openBrowserAsync(platform.loginUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });

      const vault = await readVault();
      const nextSession: SocialSession = {
        ...vault[platform.id],
        connected: true,
        authorizedAt: new Date().toISOString(),
        expiresAt: getExpiryDate(),
        consentAcceptedAt: new Date().toISOString(),
        lastConnectorCheckAt: new Date().toISOString(),
        source: 'connector-consent-session',
        connectorMode: 'dev-build-required',
      };
      const nextVault = {
        ...vault,
        [platform.id]: nextSession,
      };

      await writeVault(nextVault);
      setSession(nextSession);
      setNotice(t.opened);
      debugSocialVault(nextVault, `${platform.label} connector session prepared`);
    } finally {
      setIsOpening(false);
    }
  }

  async function disconnect() {
    if (!platform) {
      return;
    }

    const vault = await readVault();
    const nextVault = {
      ...vault,
      [platform.id]: {
        connected: false,
        connectorMode: 'dev-build-required',
      },
    };

    await writeVault(nextVault);
    setSession(nextVault[platform.id]);
    setConsentAccepted(false);
    setNotice('');
    debugSocialVault(nextVault, `${platform.label} connector disconnected`);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={22} color="#111318" />
            <Text style={styles.backText}>{t.back}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={[styles.platformIcon, { backgroundColor: platform.accent }]}>
            <MaterialCommunityIcons name={platform.icon} size={30} color="#111318" />
          </View>
          <Text style={styles.eyebrow}>{t.secureConnector}</Text>
          <Text style={styles.title}>{platform.label}</Text>
          <Text style={styles.subtitle}>{t.intro}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: connected ? '#67E8F9' : '#FF5A5F' }]} />
            <Text style={styles.statusText}>{connected ? t.connected : t.notConnected}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{t.consentTitle}</Text>
              <Text style={styles.sectionBody}>{t.consentBody}</Text>
            </View>
            <Switch
              onValueChange={setConsentAccepted}
              thumbColor={consentAccepted ? '#111318' : '#F7F8F5'}
              trackColor={{ false: '#CBD5E1', true: '#67E8F9' }}
              value={consentAccepted}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!consentAccepted || isOpening}
            onPress={startSecureSession}
            style={[styles.primaryButton, (!consentAccepted || isOpening) && styles.disabledButton]}>
            {isOpening ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <MaterialCommunityIcons name="shield-key-outline" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.primaryButtonText}>{t.start}</Text>
          </Pressable>

          {connected ? (
            <Pressable accessibilityRole="button" onPress={disconnect} style={styles.secondaryButton}>
              <MaterialCommunityIcons name="logout" size={18} color="#111318" />
              <Text style={styles.secondaryButtonText}>{t.disconnect}</Text>
            </Pressable>
          ) : null}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.diagnostics}</Text>

          <View style={styles.diagnosticsGrid}>
            <DiagnosticItem label={t.authArtifacts} value={String(artifactCount)} />
            <DiagnosticItem label={t.cookies} value={String(countRecord(session?.cookies))} />
            <DiagnosticItem label={t.localStorage} value={String(countRecord(session?.localStorage))} />
            <DiagnosticItem label={t.sessionStorage} value={String(countRecord(session?.sessionStorage))} />
            <DiagnosticItem label={t.tokens} value={String(countRecord(session?.tokens))} />
            <DiagnosticItem
              label={t.session}
              value={hasAuthArtifacts(session) ? t.ready : session?.connectorMode ?? t.pending}
            />
          </View>
        </View>

        <View style={styles.devPanel}>
          <MaterialCommunityIcons name="cellphone-cog" size={22} color="#111318" />
          <View style={styles.devPanelBody}>
            <Text style={styles.devPanelTitle}>{t.devBuild}</Text>
            <Text style={styles.devPanelText}>{t.devBuildBody}</Text>
            <Text style={styles.devPanelBadge}>{t.ready}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DiagnosticItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticItem}>
      <Text style={styles.diagnosticValue}>{value}</Text>
      <Text style={styles.diagnosticLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F6F8FC',
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 42,
  },
  centerState: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
  },
  topBar: {
    alignItems: 'flex-start',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  backText: {
    color: '#111318',
    fontSize: 14,
    fontWeight: '900',
  },
  hero: {
    backgroundColor: '#111318',
    borderRadius: 24,
    gap: 10,
    padding: 18,
  },
  platformIcon: {
    alignItems: 'center',
    borderRadius: 17,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  eyebrow: {
    color: '#67E8F9',
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  subtitle: {
    color: '#D8E2EE',
    fontSize: 15,
    lineHeight: 22,
  },
  statusRow: {
    alignItems: 'center',
    borderColor: '#2B3440',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    padding: 11,
  },
  statusDot: {
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#111318',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionBody: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 260,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111318',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#111318',
    fontSize: 14,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.5,
  },
  notice: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  diagnosticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  diagnosticItem: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '48%',
    gap: 3,
    minHeight: 74,
    padding: 12,
  },
  diagnosticValue: {
    color: '#111318',
    fontSize: 18,
    fontWeight: '900',
  },
  diagnosticLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  devPanel: {
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  devPanelBody: {
    flex: 1,
    gap: 6,
  },
  devPanelTitle: {
    color: '#111318',
    fontSize: 15,
    fontWeight: '900',
  },
  devPanelText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  devPanelBadge: {
    color: '#111318',
    fontSize: 13,
    fontWeight: '900',
  },
});
