import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { readAnalysisHistory, type AnalysisHistoryEntry } from '@/lib/analysis-history';
import { syncBillingFromSupabase } from '@/lib/billing-sync';
import { formatHumanDateTime, formatResetDate } from '@/lib/date-format';
import { readJson, readVault, SETTINGS_KEY, socialPlatforms } from '@/lib/social-vault';
import { getPlan, nextResetAt, readSubscriptionState, readUsageState, type SubscriptionState, type UsageState } from '@/lib/subscriptions';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Language } from '@/lib/i18n';

type Settings = {
  language: Language;
  themeMode: 'system' | 'white' | 'dark' | 'auto';
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function UserDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [connectedSources, setConnectedSources] = useState(0);
  const [loading, setLoading] = useState(true);

  const copy = dashboardCopy[language];
  const activePlan = getPlan(subscription?.planId ?? 'free');
  const monthUsed = usage?.month.usedAnalyses ?? 0;
  const weekUsed = usage?.week.usedAnalyses ?? 0;
  const hourUsed = usage?.hour.usedAnalyses ?? 0;
  const creditLimit = activePlan.id === 'free' ? activePlan.monthlyAnalyses : activePlan.weeklyAnalyses;
  const creditUsed = activePlan.id === 'free' ? monthUsed : weekUsed;
  const creditPercent = creditLimit > 0 ? Math.min(Math.round((creditUsed / creditLimit) * 100), 100) : 0;
  const lastAnalysis = history[0];
  const nextReset = useMemo(() => {
    const now = new Date().toISOString();
    if (activePlan.id === 'free') {
      return nextResetAt(usage?.month.windowStartedAt ?? now, MONTH_MS);
    }

    return nextResetAt(usage?.week.windowStartedAt ?? now, WEEK_MS);
  }, [activePlan.id, usage]);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!isSupabaseConfigured() || !currentSession) {
        router.replace('/analyze' as never);
        return;
      }

      const [settings, remoteBilling, fallbackSubscription, fallbackUsage, nextHistory, vault] = await Promise.all([
        readJson<Settings>(SETTINGS_KEY, { language: 'en', themeMode: 'system' }),
        syncBillingFromSupabase(),
        readSubscriptionState(),
        readUsageState(),
        readAnalysisHistory(),
        readVault(),
      ]);

      setSession(currentSession);
      setLanguage(settings.language);
      setSubscription(remoteBilling?.subscription ?? fallbackSubscription);
      setUsage(remoteBilling?.usage ?? fallbackUsage);
      setHistory(nextHistory);
      setConnectedSources(Object.values(vault).filter((item) => item?.connected).length);
    } catch (error) {
      console.log('[BullshitDetector] Dashboard refresh failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => authSubscription.unsubscribe();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#0F172A', '#172554', '#0F766E']} style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
              <Text style={styles.title}>Bullshit Detector</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/account' as never)} style={styles.iconButton}>
              <MaterialCommunityIcons name="account-circle-outline" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {session?.user.email ? `${copy.signedInAs} ${session.user.email}` : copy.loadingAccount}
          </Text>

          <View style={styles.heroStats}>
            <StatPill label={copy.plan} value={activePlan.name} />
            <StatPill label={copy.credits} value={`${creditPercent}%`} />
            <StatPill label={copy.sources} value={`${connectedSources}/${socialPlatforms.length}`} />
          </View>
        </LinearGradient>

        <View style={styles.quickGrid}>
          <DashboardAction
            icon="radar"
            title={copy.launchAnalysis}
            subtitle={copy.launchAnalysisHint}
            color="#2563EB"
            onPress={() => router.push('/analyze' as never)}
          />
          <DashboardAction
            icon="chart-timeline-variant-shimmer"
            title={copy.analysisDashboard}
            subtitle={lastAnalysis ? `${lastAnalysis.score}/100 - ${formatHumanDateTime(lastAnalysis.createdAt, language)}` : copy.noAnalysis}
            color="#7C3AED"
            onPress={() => router.push('/analysis' as never)}
          />
          <DashboardAction
            icon="credit-card-chip-outline"
            title={copy.subscriptionDashboard}
            subtitle={`${creditUsed}/${creditLimit} - ${copy.reset} ${formatResetDate(nextReset, language)}`}
            color="#0F766E"
            onPress={() => router.push('/subscription')}
          />
          <DashboardAction
            icon="cog-outline"
            title={copy.settings}
            subtitle={copy.settingsHint}
            color="#E11D48"
            onPress={() => router.push('/settings' as never)}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{copy.usageTitle}</Text>
            <Text style={styles.sectionMeta}>{loading ? copy.refreshing : copy.live}</Text>
          </View>

          <UsageBar label={copy.month} value={monthUsed} limit={activePlan.monthlyAnalyses} color="#2563EB" />
          <UsageBar label={copy.week} value={weekUsed} limit={activePlan.weeklyAnalyses} color="#7C3AED" />
          <UsageBar label={copy.hour} value={hourUsed} limit={activePlan.hourlyAnalyses} color="#0F766E" />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{copy.recentTitle}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/history')}>
              <Text style={styles.sectionLink}>{copy.viewAll}</Text>
            </Pressable>
          </View>

          {history.slice(0, 3).map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <View style={[styles.historyScore, { borderColor: riskColor(entry.risk) }]}>
                <Text style={[styles.historyScoreText, { color: riskColor(entry.risk) }]}>{entry.score}</Text>
              </View>
              <View style={styles.historyBody}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {entry.platform ?? (entry.inputType === 'url' ? copy.urlAnalysis : copy.textAnalysis)}
                </Text>
                <Text style={styles.historyMeta}>{formatHumanDateTime(entry.createdAt, language)} - IA</Text>
              </View>
            </View>
          ))}

          {!history.length ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="history" size={22} color="#64748B" />
              <Text style={styles.emptyText}>{copy.emptyHistory}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function DashboardAction({
  icon,
  title,
  subtitle,
  color,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionCard}>
      <View style={[styles.actionIcon, { backgroundColor: `${color}1A` }]}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function UsageBar({ label, value, limit, color }: { label: string; value: number; limit: number; color: string }) {
  const percent = limit > 0 ? Math.min(Math.round((value / limit) * 100), 100) : 0;

  return (
    <View style={styles.usageItem}>
      <View style={styles.usageTop}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usageValue}>
          {value}/{limit}
        </Text>
      </View>
      <View style={styles.usageTrack}>
        <View style={[styles.usageFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function riskColor(risk: string) {
  if (risk === 'faible') return '#10B981';
  if (risk === 'moyen') return '#F59E0B';
  return '#EF4444';
}

const dashboardCopy = {
  en: {
    eyebrow: 'User dashboard',
    signedInAs: 'Signed in as',
    loadingAccount: 'Loading your secure account...',
    plan: 'Plan',
    credits: 'Credits',
    sources: 'Sources',
    launchAnalysis: 'Analyze',
    launchAnalysisHint: 'Text, URL, or combined social context',
    analysisDashboard: 'Analysis dashboard',
    subscriptionDashboard: 'Subscription dashboard',
    noAnalysis: 'No AI analysis yet',
    settings: 'Settings',
    settingsHint: 'Language, theme, connectors',
    usageTitle: 'Quota overview',
    refreshing: 'Refreshing',
    live: 'Live',
    month: 'Month',
    week: 'Week',
    hour: 'Hour',
    reset: 'reset',
    recentTitle: 'Recent AI analyses',
    viewAll: 'View all',
    urlAnalysis: 'URL analysis',
    textAnalysis: 'Text analysis',
    emptyHistory: 'Run your first AI analysis to fill this dashboard.',
  },
  fr: {
    eyebrow: 'Dashboard utilisateur',
    signedInAs: 'Connecte avec',
    loadingAccount: 'Chargement du compte securise...',
    plan: 'Plan',
    credits: 'Credits',
    sources: 'Sources',
    launchAnalysis: 'Analyser',
    launchAnalysisHint: 'Texte, URL, ou contexte social combine',
    analysisDashboard: 'Dashboard analyse',
    subscriptionDashboard: 'Dashboard abonnement',
    noAnalysis: 'Aucune analyse IA pour le moment',
    settings: 'Parametres',
    settingsHint: 'Langue, theme, connecteurs',
    usageTitle: 'Vue des quotas',
    refreshing: 'Actualisation',
    live: 'En direct',
    month: 'Mois',
    week: 'Semaine',
    hour: 'Heure',
    reset: 'reset',
    recentTitle: 'Analyses IA recentes',
    viewAll: 'Tout voir',
    urlAnalysis: 'Analyse URL',
    textAnalysis: 'Analyse texte',
    emptyHistory: 'Lance ta premiere analyse IA pour remplir ce dashboard.',
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
  hero: {
    borderRadius: 24,
    gap: 16,
    overflow: 'hidden',
    padding: 20,
  },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: '#67E8F9',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  subtitle: {
    color: '#DDE7F4',
    fontSize: 15,
    lineHeight: 22,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statPill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 62,
    padding: 10,
  },
  statLabel: {
    color: '#BFD2EA',
    fontSize: 11,
    fontWeight: '800',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EB',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    minHeight: 146,
    padding: 15,
    width: '48%',
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionTitle: {
    color: '#101014',
    fontSize: 16,
    fontWeight: '900',
  },
  actionSubtitle: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#101014',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionLink: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '900',
  },
  usageItem: {
    gap: 7,
  },
  usageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageLabel: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  usageValue: {
    color: '#101014',
    fontSize: 13,
    fontWeight: '900',
  },
  usageTrack: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    height: 9,
    overflow: 'hidden',
  },
  usageFill: {
    borderRadius: 999,
    height: '100%',
  },
  historyRow: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  historyScore: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  historyScoreText: {
    fontSize: 14,
    fontWeight: '900',
  },
  historyBody: {
    flex: 1,
    gap: 2,
  },
  historyTitle: {
    color: '#101014',
    fontSize: 14,
    fontWeight: '900',
  },
  historyMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    gap: 8,
    padding: 18,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
