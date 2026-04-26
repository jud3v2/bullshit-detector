import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { redirectToLoginIfNeeded } from '@/lib/auth-redirect';
import type { Language } from '@/lib/i18n';
import { formatHumanDate } from '@/lib/date-format';
import {
  readJson,
  readVault,
  SETTINGS_KEY,
  socialPlatforms,
  type SocialId,
  type SocialSession,
  writeJson,
} from '@/lib/social-vault';

type ThemeMode = 'system' | 'white' | 'dark' | 'auto';
type AppSettings = {
  language: Language;
  themeMode: ThemeMode;
};

export default function SettingsDashboard() {
  const [language, setLanguage] = useState<Language>('en');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [sessions, setSessions] = useState<Record<SocialId, SocialSession>>({} as Record<SocialId, SocialSession>);
  const copy = settingsCopy[language];

  const refresh = useCallback(async () => {
    await redirectToLoginIfNeeded();
    const [settings, vault] = await Promise.all([
      readJson<AppSettings>(SETTINGS_KEY, { language: 'en', themeMode: 'system' }),
      readVault(),
    ]);
    setLanguage(settings.language);
    setThemeMode(settings.themeMode);
    setSessions(vault);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        console.log('[BullshitDetector] Settings refresh failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, [refresh]),
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  async function persist(next: Partial<AppSettings>) {
    const nextSettings = {
      language,
      themeMode,
      ...next,
    };
    setLanguage(nextSettings.language);
    setThemeMode(nextSettings.themeMode);
    await writeJson(SETTINGS_KEY, nextSettings);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={22} color="#101014" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.title}>{copy.title}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.language}</Text>
          <View style={styles.segment}>
            {(['en', 'fr'] as const).map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item}
                onPress={() => persist({ language: item })}
                style={[styles.segmentButton, language === item && styles.segmentButtonActive]}>
                <Text style={[styles.segmentText, language === item && styles.segmentTextActive]}>
                  {item === 'fr' ? 'Francais' : 'English'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.theme}</Text>
          <View style={styles.themeGrid}>
            {(['system', 'white', 'dark', 'auto'] as const).map((mode) => (
              <Pressable
                accessibilityRole="button"
                key={mode}
                onPress={() => persist({ themeMode: mode })}
                style={[styles.themeButton, themeMode === mode && styles.themeButtonActive]}>
                <MaterialCommunityIcons name={themeIcon[mode]} size={19} color={themeMode === mode ? '#FFFFFF' : '#334155'} />
                <Text style={[styles.themeText, themeMode === mode && styles.themeTextActive]}>{copy[mode]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{copy.connectors}</Text>
              <Text style={styles.sectionSubtitle}>{copy.connectorsHint}</Text>
            </View>
          </View>

          {socialPlatforms.map((platform) => {
            const session = sessions[platform.id];
            const connected = Boolean(session?.connected);

            return (
              <Pressable
                accessibilityRole="button"
                key={platform.id}
                onPress={() => router.push(`/connector/${platform.id}`)}
                style={styles.connectorRow}>
                <View style={[styles.connectorIcon, { backgroundColor: `${platform.accent}24` }]}>
                  <MaterialCommunityIcons name={platform.icon} size={19} color={platform.accent} />
                </View>
                <View style={styles.connectorBody}>
                  <Text style={styles.connectorTitle}>{platform.label}</Text>
                  <Text style={styles.connectorMeta}>
                    {connected
                      ? `${copy.connected} - ${formatHumanDate(session?.authorizedAt, language)}`
                      : copy.notConnected}
                  </Text>
                </View>
                <Switch value={connected} disabled trackColor={{ false: '#CBD5E1', true: '#A7F3D0' }} thumbColor={connected ? '#10B981' : '#F8FAFC'} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const themeIcon = {
  system: 'cellphone-cog',
  white: 'white-balance-sunny',
  dark: 'moon-waning-crescent',
  auto: 'theme-light-dark',
} satisfies Record<ThemeMode, keyof typeof MaterialCommunityIcons.glyphMap>;

const settingsCopy = {
  en: {
    eyebrow: 'Product settings',
    title: 'Settings',
    language: 'Language',
    theme: 'Appearance',
    system: 'System',
    white: 'Light',
    dark: 'Dark',
    auto: 'Auto',
    connectors: 'Secure connectors',
    connectorsHint: 'Consent-based source sessions for richer authorized analysis.',
    connected: 'Connected',
    notConnected: 'Not connected',
  },
  fr: {
    eyebrow: 'Parametres produit',
    title: 'Parametres',
    language: 'Langue',
    theme: 'Apparence',
    system: 'Systeme',
    white: 'Clair',
    dark: 'Sombre',
    auto: 'Auto',
    connectors: 'Connecteurs securises',
    connectorsHint: 'Sessions consenties pour enrichir les analyses autorisees.',
    connected: 'Connecte',
    notConnected: 'Non connecte',
  },
} satisfies Record<Language, Record<string, string>>;

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F6F8FC',
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#101014',
    fontSize: 34,
    fontWeight: '900',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EB',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#101014',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  segment: {
    backgroundColor: '#EEF2F7',
    borderRadius: 14,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#101014',
  },
  segmentText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  themeButton: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    width: '47%',
  },
  themeButtonActive: {
    backgroundColor: '#101014',
    borderColor: '#101014',
  },
  themeText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  themeTextActive: {
    color: '#FFFFFF',
  },
  connectorRow: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  connectorIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  connectorBody: {
    flex: 1,
    gap: 2,
  },
  connectorTitle: {
    color: '#101014',
    fontSize: 15,
    fontWeight: '900',
  },
  connectorMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
});
