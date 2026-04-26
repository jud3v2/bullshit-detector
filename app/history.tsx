import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiquidGlass } from '@/components/liquid-glass';
import { readAnalysisHistory, type AnalysisHistoryEntry } from '@/lib/analysis-history';
import { redirectToLoginIfNeeded } from '@/lib/auth-redirect';
import { formatHumanDateTime } from '@/lib/date-format';
import type { Language } from '@/lib/i18n';
import { readJson, SETTINGS_KEY } from '@/lib/social-vault';

type AppSettings = {
  language: Language;
  themeMode: 'system' | 'white' | 'dark' | 'auto';
};

export default function HistoryScreen() {
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    redirectToLoginIfNeeded();
    Promise.all([
      readAnalysisHistory(),
      readJson<AppSettings>(SETTINGS_KEY, { language: 'en', themeMode: 'system' }),
    ])
      .then(([nextHistory, settings]) => {
        setHistory(nextHistory);
        setLanguage(settings.language);
      })
      .catch((error) => {
        console.log('[BullshitDetector] History screen load failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#101014" />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Historique local</Text>
          <Text style={styles.title}>Toutes les analyses</Text>
          <Text style={styles.subtitle}>
            L’app conserve seulement un resume compact des derniers resultats, pas le contenu complet.
          </Text>
        </View>

        {history.length ? (
          <View style={styles.list}>
            {history.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} language={language} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="history" size={26} color="#64748B" />
            <Text style={styles.emptyTitle}>Aucun historique pour le moment</Text>
            <Text style={styles.emptyText}>Lance une analyse IA pour voir les resultats ici.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryCard({ entry, language }: { entry: AnalysisHistoryEntry; language: Language }) {
  const riskColor = entry.risk === 'faible' ? '#10B981' : entry.risk === 'moyen' ? '#F59E0B' : '#EF4444';

  return (
    <LiquidGlass style={styles.card} contentStyle={styles.cardContent}>
      <View style={styles.cardTop}>
        <View style={[styles.scoreBadge, { borderColor: riskColor }]}>
          <Text style={[styles.scoreText, { color: riskColor }]}>{entry.score}</Text>
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {entry.platform ?? (entry.inputType === 'url' ? 'URL analysee' : 'Texte analyse')}
          </Text>
          <Text style={styles.cardMeta}>
            {formatHumanDateTime(entry.createdAt, language)} · IA
          </Text>
        </View>
        <View style={[styles.riskPill, { backgroundColor: `${riskColor}1A` }]}>
          <Text style={[styles.riskText, { color: riskColor }]}>{entry.risk}</Text>
        </View>
      </View>

      <Text style={styles.preview}>{entry.preview}</Text>

      {entry.url ? (
        <Text style={styles.url} numberOfLines={1}>{entry.url}</Text>
      ) : null}

      {entry.redFlags.length ? (
        <View style={styles.flags}>
          {entry.redFlags.map((flag) => (
            <View key={flag} style={styles.flag}>
              <Text style={styles.flagText} numberOfLines={1}>{flag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {entry.aiVerdict ? (
        <View style={styles.aiLine}>
          <MaterialCommunityIcons name="auto-fix" size={15} color="#7C3AED" />
          <Text style={styles.aiLineText}>
            Verdict IA: {entry.aiVerdict}
            {typeof entry.aiConfidence === 'number' ? ` · confiance ${Math.round(entry.aiConfidence * 100)}%` : ''}
          </Text>
        </View>
      ) : null}
    </LiquidGlass>
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
  header: {
    backgroundColor: '#101014',
    borderRadius: 22,
    gap: 8,
    padding: 18,
  },
  eyebrow: {
    color: '#67E8F9',
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    color: '#D8E2EE',
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardContent: {
    gap: 10,
    padding: 16,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  scoreBadge: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  scoreText: {
    fontSize: 15,
    fontWeight: '900',
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    color: '#101014',
    fontSize: 14,
    fontWeight: '900',
  },
  cardMeta: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  riskPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  riskText: {
    fontSize: 12,
    fontWeight: '900',
  },
  preview: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
  },
  url: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '800',
  },
  flags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  flag: {
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  flagText: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '800',
  },
  aiLine: {
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderRadius: 11,
    flexDirection: 'row',
    gap: 7,
    padding: 9,
  },
  aiLineText: {
    color: '#4C1D95',
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyTitle: {
    color: '#101014',
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
