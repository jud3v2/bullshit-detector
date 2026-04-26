import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { readAnalysisHistory, type AnalysisHistoryEntry } from '@/lib/analysis-history';
import { redirectToLoginIfNeeded } from '@/lib/auth-redirect';
import { formatHumanDateTime } from '@/lib/date-format';
import type { Language } from '@/lib/i18n';
import { readJson, SETTINGS_KEY } from '@/lib/social-vault';

type AppSettings = {
  language: Language;
  themeMode: 'system' | 'white' | 'dark' | 'auto';
};

export default function AnalysisDashboard() {
  const [language, setLanguage] = useState<Language>('en');
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const copy = analysisCopy[language];

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      async function refresh() {
        await redirectToLoginIfNeeded();
        const [nextHistory, settings] = await Promise.all([
          readAnalysisHistory(),
          readJson<AppSettings>(SETTINGS_KEY, { language: 'en', themeMode: 'system' }),
        ]);

        if (!mounted) {
          return;
        }

        setHistory(nextHistory);
        setLanguage(settings.language);
      }

      refresh().catch((error) => {
        console.log('[BullshitDetector] Analysis dashboard failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });

      return () => {
        mounted = false;
      };
    }, []),
  );

  const stats = useMemo(() => buildStats(history), [history]);
  const latest = history[0];

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

        <LinearGradient colors={['#111827', '#312E81', '#7C2D12']} style={styles.hero}>
          <View>
            <Text style={styles.heroLabel}>{copy.averageScore}</Text>
            <Text style={styles.heroScore}>{stats.averageScore}/100</Text>
          </View>
          <Text style={styles.heroText}>
            {history.length
              ? copy.heroFilled.replace('{count}', String(history.length))
              : copy.heroEmpty}
          </Text>
        </LinearGradient>

        <View style={styles.statsGrid}>
          <StatCard icon="shield-check-outline" label={copy.lowRisk} value={String(stats.low)} color="#10B981" />
          <StatCard icon="alert-outline" label={copy.mediumRisk} value={String(stats.medium)} color="#F59E0B" />
          <StatCard icon="alert-octagon-outline" label={copy.highRisk} value={String(stats.high)} color="#EF4444" />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{copy.latest}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/history')}>
              <Text style={styles.sectionLink}>{copy.fullHistory}</Text>
            </Pressable>
          </View>

          {latest ? (
            <View style={styles.latestCard}>
              <View style={[styles.latestScore, { borderColor: riskColor(latest.risk) }]}>
                <Text style={[styles.latestScoreText, { color: riskColor(latest.risk) }]}>{latest.score}</Text>
              </View>
              <View style={styles.latestBody}>
                <Text style={styles.latestTitle}>{latest.platform ?? copy.manualContent}</Text>
                <Text style={styles.latestMeta}>{formatHumanDateTime(latest.createdAt, language)} - IA</Text>
                <Text style={styles.latestPreview} numberOfLines={3}>{latest.preview}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="radar" size={26} color="#64748B" />
              <Text style={styles.emptyText}>{copy.noAnalysis}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/analyze' as never)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{copy.startAnalysis}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, color }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}1A` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function buildStats(history: AnalysisHistoryEntry[]) {
  const total = history.reduce((sum, entry) => sum + entry.score, 0);

  return {
    averageScore: history.length ? Math.round(total / history.length) : 0,
    low: history.filter((entry) => entry.risk === 'faible').length,
    medium: history.filter((entry) => entry.risk === 'moyen').length,
    high: history.filter((entry) => entry.risk === 'eleve').length,
  };
}

function riskColor(risk: string) {
  if (risk === 'faible') return '#10B981';
  if (risk === 'moyen') return '#F59E0B';
  return '#EF4444';
}

const analysisCopy = {
  en: {
    eyebrow: 'Analysis dashboard',
    title: 'AI analysis',
    averageScore: 'Average reliability',
    heroFilled: '{count} AI analyses summarized locally.',
    heroEmpty: 'No AI signal yet. Run an analysis to unlock the dashboard.',
    lowRisk: 'Low risk',
    mediumRisk: 'Medium',
    highRisk: 'High risk',
    latest: 'Latest result',
    fullHistory: 'Full history',
    manualContent: 'Manual content',
    noAnalysis: 'No AI analysis yet.',
    startAnalysis: 'Start analysis',
  },
  fr: {
    eyebrow: 'Dashboard analyse',
    title: 'Analyse IA',
    averageScore: 'Fiabilite moyenne',
    heroFilled: '{count} analyses IA resumees localement.',
    heroEmpty: 'Aucun signal IA pour le moment. Lance une analyse pour debloquer le dashboard.',
    lowRisk: 'Risque faible',
    mediumRisk: 'Moyen',
    highRisk: 'Risque eleve',
    latest: 'Dernier resultat',
    fullHistory: 'Historique complet',
    manualContent: 'Contenu manuel',
    noAnalysis: 'Aucune analyse IA pour le moment.',
    startAnalysis: 'Lancer une analyse',
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
    color: '#7C3AED',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#101014',
    fontSize: 34,
    fontWeight: '900',
  },
  hero: {
    borderRadius: 24,
    gap: 12,
    padding: 20,
  },
  heroLabel: {
    color: '#DDD6FE',
    fontSize: 13,
    fontWeight: '900',
  },
  heroScore: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 54,
  },
  heroText: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0EB',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 122,
    padding: 12,
  },
  statIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  statValue: {
    color: '#101014',
    fontSize: 26,
    fontWeight: '900',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
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
  },
  sectionTitle: {
    color: '#101014',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionLink: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '900',
  },
  latestCard: {
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  latestScore: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  latestScoreText: {
    fontSize: 18,
    fontWeight: '900',
  },
  latestBody: {
    flex: 1,
    gap: 4,
  },
  latestTitle: {
    color: '#101014',
    fontSize: 16,
    fontWeight: '900',
  },
  latestMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  latestPreview: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    gap: 10,
    padding: 18,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#101014',
    borderRadius: 14,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
