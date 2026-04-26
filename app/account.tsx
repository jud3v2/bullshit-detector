import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { redirectToLoginIfNeeded } from '@/lib/auth-redirect';
import { formatHumanDateTime } from '@/lib/date-format';
import type { Language } from '@/lib/i18n';
import { readJson, SETTINGS_KEY } from '@/lib/social-vault';
import { supabase } from '@/lib/supabase';

type Settings = {
  language: Language;
  themeMode: 'system' | 'white' | 'dark' | 'auto';
};

export default function AccountDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const copy = accountCopy[language];

  const refresh = useCallback(async () => {
    await redirectToLoginIfNeeded();
    const [{ data }, settings] = await Promise.all([
      supabase.auth.getSession(),
      readJson<Settings>(SETTINGS_KEY, { language: 'en', themeMode: 'system' }),
    ]);
    setSession(data.session);
    setLanguage(settings.language);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        console.log('[BullshitDetector] Account refresh failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, [refresh]),
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/analyze' as never);
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

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.email}>{session?.user.email ?? copy.unknownEmail}</Text>
          <Text style={styles.meta}>
            {copy.created} {formatHumanDateTime(session?.user.created_at, language)}
          </Text>
        </View>

        <View style={styles.section}>
          <AccountRow icon="shield-check-outline" label={copy.authProvider} value={session?.user.app_metadata?.provider ?? 'email'} />
          <AccountRow icon="email-check-outline" label={copy.emailStatus} value={session?.user.email_confirmed_at ? copy.confirmed : copy.pending} />
          <AccountRow icon="clock-outline" label={copy.lastSignIn} value={formatHumanDateTime(session?.user.last_sign_in_at, language)} />
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/subscription')} style={styles.primaryButton}>
            <MaterialCommunityIcons name="credit-card-chip-outline" size={19} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{copy.manageSubscription}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={signOut} style={styles.dangerButton}>
            <MaterialCommunityIcons name="logout" size={19} color="#E11D48" />
            <Text style={styles.dangerButtonText}>{copy.signOut}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountRow({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.accountRow}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon} size={18} color="#2563EB" />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const accountCopy = {
  en: {
    eyebrow: 'User account',
    title: 'Account',
    unknownEmail: 'Unknown email',
    created: 'Created',
    authProvider: 'Auth provider',
    emailStatus: 'Email status',
    confirmed: 'Confirmed',
    pending: 'Pending confirmation',
    lastSignIn: 'Last sign-in',
    manageSubscription: 'Manage subscription',
    signOut: 'Sign out',
  },
  fr: {
    eyebrow: 'Compte utilisateur',
    title: 'Compte',
    unknownEmail: 'Email inconnu',
    created: 'Cree',
    authProvider: 'Methode de connexion',
    emailStatus: 'Statut email',
    confirmed: 'Confirme',
    pending: 'Validation en attente',
    lastSignIn: 'Derniere connexion',
    manageSubscription: 'Gerer l’abonnement',
    signOut: 'Se deconnecter',
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
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#101014',
    borderRadius: 24,
    gap: 8,
    padding: 22,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  email: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  meta: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EB',
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  accountRow: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  rowValue: {
    color: '#101014',
    fontSize: 14,
    fontWeight: '900',
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#FFE4E6',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  dangerButtonText: {
    color: '#E11D48',
    fontSize: 15,
    fontWeight: '900',
  },
});
