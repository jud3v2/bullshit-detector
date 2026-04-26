import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AdvancedAiAnalysis } from './ai-gateway-client';
import type { DetectionResult } from './analysis-result';
import type { SocialUrlContext } from './social-url';

export type AnalysisHistoryEntry = {
  id: string;
  createdAt: string;
  mode: 'ai';
  inputType: 'text' | 'url';
  preview: string;
  url?: string;
  platform?: string;
  score: number;
  risk: DetectionResult['risk'];
  redFlags: string[];
  aiVerdict?: AdvancedAiAnalysis['verdict'];
  aiConfidence?: number;
  model?: string;
};

const HISTORY_KEY = 'bullshit-detector.analysis-history.v1';
const HISTORY_MIGRATED_KEY = 'bullshit-detector.analysis-history.migrated.v1';
const MAX_HISTORY_ENTRIES = 50;
const PREVIEW_LENGTH = 180;
const RED_FLAGS_LIMIT = 3;

export async function readAnalysisHistory(): Promise<AnalysisHistoryEntry[]> {
  try {
    await migrateSecureHistoryIfNeeded();
    const value = await readLocalValue(HISTORY_KEY);

    if (!value) {
      return [];
    }

    const parsed = JSON.parse(value) as AnalysisHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log('[BullshitDetector] History read failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

export async function saveAnalysisHistoryEntry({
  mode,
  input,
  result,
  aiResult,
  urlContext,
}: {
  mode: AnalysisHistoryEntry['mode'];
  input: string;
  result: DetectionResult;
  aiResult?: AdvancedAiAnalysis | null;
  urlContext?: SocialUrlContext | null;
}) {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return;
  }

  const history = await readAnalysisHistory();
  const entry: AnalysisHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    mode,
    inputType: urlContext ? 'url' : 'text',
    preview: compactPreview(urlContext?.summary || urlContext?.description || trimmedInput),
    url: urlContext?.url,
    platform: urlContext?.platform,
    score: result.score,
    risk: result.risk,
    redFlags: result.redFlags.slice(0, RED_FLAGS_LIMIT),
    aiVerdict: aiResult?.verdict,
    aiConfidence: aiResult?.confidence,
    model: aiResult?.model,
  };
  const nextHistory = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);

  try {
    await writeLocalValue(HISTORY_KEY, JSON.stringify(nextHistory));
  } catch (error) {
    console.log('[BullshitDetector] History write failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function compactPreview(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
}

async function readLocalValue(key: string) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }

  return AsyncStorage.getItem(key);
}

async function writeLocalValue(key: string, value: string) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
    return;
  }

  await AsyncStorage.setItem(key, value);
}

async function migrateSecureHistoryIfNeeded() {
  if (Platform.OS === 'web') {
    return;
  }

  let migrated: string | null = null;

  try {
    migrated = await AsyncStorage.getItem(HISTORY_MIGRATED_KEY);
  } catch {
    return;
  }

  if (migrated === 'true') {
    return;
  }

  try {
    const secureHistory = await SecureStore.getItemAsync(HISTORY_KEY);

    if (secureHistory && !(await AsyncStorage.getItem(HISTORY_KEY))) {
      await AsyncStorage.setItem(HISTORY_KEY, secureHistory);
    }
  } catch {
    // SecureStore may reject oversized values in future SDKs; history can safely start empty.
  } finally {
    try {
      await AsyncStorage.setItem(HISTORY_MIGRATED_KEY, 'true');
    } catch {
      // Ignore migration marker failure; reading history should never crash the app.
    }
  }
}
