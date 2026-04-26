import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { redirectToLoginIfNeeded } from '@/lib/auth-redirect';
import { readAnalysisHistory, type AnalysisHistoryEntry } from '@/lib/analysis-history';
import { syncBillingFromSupabase } from '@/lib/billing-sync';
import { formatHumanDate, formatResetDate } from '@/lib/date-format';
import type { Language } from '@/lib/i18n';
import { readJson, SETTINGS_KEY } from '@/lib/social-vault';
import {
  nextResetAt,
  readSubscriptionState,
  readUsageState,
  subscriptionPlans,
  type SubscriptionPlan,
  type SubscriptionState,
  writeSubscriptionState,
  type UsageState,
} from '@/lib/subscriptions';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type AppSettings = {
  language: Language;
  themeMode: 'system' | 'white' | 'dark' | 'auto';
};

function getCreditLimit(plan: SubscriptionPlan) {
  if (plan.id === 'free') {
    return plan.monthlyAnalyses;
  }

  return Math.max(Math.round(plan.aiBudgetCentsWeekly / 2), 0);
}

function getUsedCredits(usage: UsageState | null, plan: SubscriptionPlan) {
  if (plan.id === 'free') {
    return usage?.month.usedAnalyses ?? 0;
  }

  return usage ? Math.round(usage.week.usedBudgetCents / 2) : 0;
}

function getPercent(used: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(Math.round((used / limit) * 100), 100);
}

export default function SubscriptionScreen() {
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    redirectToLoginIfNeeded();
    refresh();
  }, []);

  async function refresh() {
    try {
      const [remoteBilling, fallbackSubscription, fallbackUsage, nextHistory, settings] = await Promise.all([
        syncBillingFromSupabase(),
        readSubscriptionState(),
        readUsageState(),
        readAnalysisHistory(),
        readJson<AppSettings>(SETTINGS_KEY, { language: 'en', themeMode: 'system' }),
      ]);

      setSubscription(remoteBilling?.subscription ?? fallbackSubscription);
      setUsage(remoteBilling?.usage ?? fallbackUsage);
      setHistory(nextHistory);
      setLanguage(settings.language);
    } catch (error) {
      console.log('[BullshitDetector] Subscription screen refresh failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function activatePreviewPlan(plan: SubscriptionPlan) {
    const nextSubscription: SubscriptionState = {
      planId: plan.id,
      nativeStatus: plan.id === 'free' ? 'inactive' : 'active',
      productId: plan.iosProductId ?? plan.androidProductId,
      currentPeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await writeSubscriptionState(nextSubscription);
    await refresh();
  }

  const activePlanId = subscription?.planId ?? 'free';
  const activePlan = subscriptionPlans.find((plan) => plan.id === activePlanId) ?? subscriptionPlans[0];
  const usedCredits = getUsedCredits(usage, activePlan);
  const creditLimit = getCreditLimit(activePlan);
  const creditPercent = getPercent(usedCredits, creditLimit);
  const monthlyPercent = getPercent(usage?.month.usedAnalyses ?? 0, activePlan.monthlyAnalyses);
  const weeklyPercent = getPercent(usage?.week.usedAnalyses ?? 0, activePlan.weeklyAnalyses);
  const hourlyPercent = getPercent(usage?.hour.usedAnalyses ?? 0, activePlan.hourlyAnalyses);
  const monthReset = useMemo(() => nextResetAt(usage?.month.windowStartedAt ?? new Date().toISOString(), MONTH_MS), [usage]);
  const weekReset = useMemo(() => nextResetAt(usage?.week.windowStartedAt ?? new Date().toISOString(), WEEK_MS), [usage]);
  const hourReset = useMemo(() => nextResetAt(usage?.hour.windowStartedAt ?? new Date().toISOString(), HOUR_MS), [usage]);
  const previewHistory = history.slice(0, 4);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#101014" />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>

        <LinearGradient
          colors={['#101014', '#172033', '#123B3A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>AI limits engine</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{activePlan.name}</Text>
            </View>
          </View>
          <Text style={styles.title}>Abonnement Bullshit Detector</Text>
          <Text style={styles.subtitle}>
            Credits visibles, resets clairs, analyse IA controlee et historique local compact.
          </Text>

          <View style={styles.heroMeter}>
            <View>
              <Text style={styles.heroMeterValue}>{creditPercent}%</Text>
              <Text style={styles.heroMeterLabel}>
                {activePlan.id === 'free'
                  ? `${usedCredits}/${creditLimit} analyses IA gratuites ce mois-ci`
                  : `${usedCredits}/${creditLimit} credits utilises cette semaine`}
              </Text>
            </View>
            <View style={styles.heroMeterIcon}>
              <MaterialCommunityIcons name="brain" size={24} color="#67E8F9" />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View>
              <Text style={styles.sectionTitle}>Utilisation actuelle</Text>
              <Text style={styles.sectionSubtitle}>Les couts internes restent caches. L’utilisateur voit credits et limites.</Text>
            </View>
          </View>

          <UsageMetric
            icon="chart-donut"
            label={activePlan.id === 'free' ? 'Analyses IA gratuites' : 'Credits IA hebdomadaires'}
            value={`${usedCredits}/${creditLimit}`}
            helper={`Reset ${formatResetDate(activePlan.id === 'free' ? monthReset : weekReset, language)}`}
            percent={creditPercent}
            accent="#7C3AED"
          />
          {activePlan.id === 'free' ? (
            <UsageMetric
              icon="calendar-month"
              label="Limite mensuelle gratuite"
              value={`${usage?.month.usedAnalyses ?? 0}/${activePlan.monthlyAnalyses}`}
              helper={`Passe a Starter pour continuer apres ${formatResetDate(monthReset, language)}`}
              percent={monthlyPercent}
              accent="#F59E0B"
            />
          ) : null}
          <UsageMetric
            icon="calendar-week"
            label="Analyses cette semaine"
            value={`${usage?.week.usedAnalyses ?? 0}/${activePlan.weeklyAnalyses}`}
            helper={`Protection budget + reset ${formatResetDate(weekReset, language)}`}
            percent={weeklyPercent}
            accent="#0EA5E9"
          />
          <UsageMetric
            icon="clock-fast"
            label="Anti-pic horaire"
            value={`${usage?.hour.usedAnalyses ?? 0}/${activePlan.hourlyAnalyses}`}
            helper={`Reset ${formatResetDate(hourReset, language)}`}
            percent={hourlyPercent}
            accent="#10B981"
          />
        </View>

        <View style={styles.routingPanel}>
          <View style={styles.routingIcon}>
            <MaterialCommunityIcons name="transit-connection-variant" size={22} color="#101014" />
          </View>
          <View style={styles.routingBody}>
            <Text style={styles.routingTitle}>Routage IA recommande</Text>
            <Text style={styles.routingText}>
              Recherche et contexte : Gemini Flash-Lite. Jugement humain, arnaque et bullshit : modele configurable
              moins cher tant que la qualite reste bonne.
            </Text>
          </View>
        </View>

        <View style={styles.planList}>
          {subscriptionPlans.filter((plan) => plan.id !== 'free').map((plan) => {
            const active = activePlanId === plan.id;
            const planCredits = getCreditLimit(plan);

            return (
              <View key={plan.id} style={[styles.planCard, active && styles.activePlanCard]}>
                <View style={styles.planTop}>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPrice}>{plan.priceEur.toFixed(2)} euro / mois</Text>
                  </View>
                  {active ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Actif</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.limitRow}>
                  <LimitPill value={String(planCredits)} label="credits / semaine" />
                  <LimitPill value={String(plan.hourlyAnalyses)} label="analyses / heure" />
                  <LimitPill value={String(plan.weeklyAnalyses)} label="analyses / semaine" />
                </View>

                <View style={styles.featureList}>
                  {plan.features.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                      <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => activatePreviewPlan(plan)}
                  style={[styles.primaryButton, active && styles.secondaryButton]}>
                  <MaterialCommunityIcons
                    name={active ? 'shield-check-outline' : 'credit-card-check-outline'}
                    size={18}
                    color={active ? '#101014' : '#FFFFFF'}
                  />
                  <Text style={[styles.primaryButtonText, active && styles.secondaryButtonText]}>
                    {active ? 'Plan actif' : 'Activer en preview'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.historySection}>
          <View style={styles.historyTitleRow}>
            <View style={styles.historyTitleCopy}>
              <Text style={styles.sectionTitle}>Historique local</Text>
              <Text style={styles.sectionSubtitle}>Apercu compact, sans contenu complet stocke.</Text>
            </View>
            {history.length > 4 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/history')} style={styles.loadMoreButton}>
                <Text style={styles.loadMoreText}>Charger plus</Text>
              </Pressable>
            ) : null}
          </View>

          {previewHistory.length ? (
            <View style={styles.historyList}>
              {previewHistory.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} language={language} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyHistory}>
              <MaterialCommunityIcons name="history" size={20} color="#64748B" />
              <Text style={styles.emptyHistoryText}>Les prochaines analyses apparaitront ici.</Text>
            </View>
          )}
        </View>

        <View style={styles.nativePanel}>
          <MaterialCommunityIcons name="cellphone-lock" size={22} color="#101014" />
          <View style={styles.nativeBody}>
            <Text style={styles.nativeTitle}>Achats natifs</Text>
            <Text style={styles.nativeText}>
              En Expo Go, le bouton active un plan local de preview. En dev build, StoreKit / Google Play Billing
              devront valider les recus cote backend.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageMetric({
  icon,
  label,
  value,
  helper,
  percent,
  accent,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  helper: string;
  percent: number;
  accent: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${accent}1A` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.metricBody}>
        <View style={styles.metricTop}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={styles.metricValue}>{value}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { backgroundColor: accent, width: `${percent}%` }]} />
        </View>
        <Text style={styles.metricHelper}>{helper}</Text>
      </View>
    </View>
  );
}

function LimitPill({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.limitPill}>
      <Text style={styles.limitValue}>{value}</Text>
      <Text style={styles.limitLabel}>{label}</Text>
    </View>
  );
}

function HistoryRow({ entry, language }: { entry: AnalysisHistoryEntry; language: Language }) {
  const riskColor = entry.risk === 'faible' ? '#10B981' : entry.risk === 'moyen' ? '#F59E0B' : '#EF4444';

  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyScore, { borderColor: riskColor }]}>
        <Text style={[styles.historyScoreText, { color: riskColor }]}>{entry.score}</Text>
      </View>
      <View style={styles.historyBody}>
        <Text style={styles.historyTitle} numberOfLines={1}>
          {entry.platform ?? (entry.inputType === 'url' ? 'URL' : 'Texte')}
        </Text>
        <Text style={styles.historyPreview} numberOfLines={2}>{entry.preview}</Text>
        <Text style={styles.historyMeta}>
          {formatHumanDate(entry.createdAt, language)} · IA
          {entry.aiVerdict ? ` · ${entry.aiVerdict}` : ''}
        </Text>
      </View>
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
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  backText: {
    color: '#101014',
    fontSize: 14,
    fontWeight: '900',
  },
  hero: {
    borderRadius: 24,
    gap: 12,
    overflow: 'hidden',
    padding: 18,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#67E8F9',
    fontSize: 13,
    fontWeight: '900',
  },
  statusBadge: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: '#D8E2EE',
    fontSize: 15,
    lineHeight: 22,
  },
  heroMeter: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    padding: 13,
  },
  heroMeterValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  heroMeterLabel: {
    color: '#D8E2EE',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  heroMeterIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(182,255,59,0.14)',
    borderRadius: 15,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sectionTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#101014',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 3,
  },
  historyTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  historyTitleCopy: {
    flex: 1,
    minWidth: 190,
  },
  metricCard: {
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  metricBody: {
    flex: 1,
    gap: 7,
  },
  metricTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: '#101014',
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  metricValue: {
    color: '#101014',
    fontSize: 14,
    fontWeight: '900',
  },
  progressTrack: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    height: 9,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
  },
  metricHelper: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  routingPanel: {
    alignItems: 'flex-start',
    backgroundColor: '#E0F2FE',
    borderColor: '#7DD3FC',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  routingIcon: {
    alignItems: 'center',
    backgroundColor: '#67E8F9',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  routingBody: {
    flex: 1,
    gap: 5,
  },
  routingTitle: {
    color: '#101014',
    fontSize: 16,
    fontWeight: '900',
  },
  routingText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
  },
  planList: {
    gap: 12,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  activePlanCard: {
    borderColor: '#101014',
    borderWidth: 2,
  },
  planTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  planName: {
    color: '#101014',
    fontSize: 22,
    fontWeight: '900',
  },
  planPrice: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: '#67E8F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  activeBadgeText: {
    color: '#101014',
    fontSize: 13,
    fontWeight: '900',
  },
  limitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  limitPill: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 13,
    borderWidth: 1,
    flexBasis: '31%',
    minHeight: 70,
    padding: 10,
  },
  limitValue: {
    color: '#101014',
    fontSize: 15,
    fontWeight: '900',
  },
  limitLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 3,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  featureText: {
    color: '#101014',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#101014',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    backgroundColor: '#E2E8F0',
  },
  secondaryButtonText: {
    color: '#101014',
  },
  historySection: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  loadMoreButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#101014',
    borderRadius: 12,
    flexShrink: 0,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  loadMoreText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  historyList: {
    gap: 10,
  },
  historyRow: {
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 12,
  },
  historyScore: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  historyScoreText: {
    fontSize: 15,
    fontWeight: '900',
  },
  historyBody: {
    flex: 1,
  },
  historyTitle: {
    color: '#101014',
    fontSize: 14,
    fontWeight: '900',
  },
  historyPreview: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 3,
  },
  historyMeta: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },
  emptyHistory: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  emptyHistoryText: {
    color: '#475569',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  nativePanel: {
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  nativeBody: {
    flex: 1,
    gap: 6,
  },
  nativeTitle: {
    color: '#101014',
    fontSize: 16,
    fontWeight: '900',
  },
  nativeText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
});
