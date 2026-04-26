import Constants from 'expo-constants';

import type { Language } from './i18n';
import type { SocialUrlContext } from './social-url';
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export type AdvancedAiAnalysis = {
  task?: 'research' | 'analysis';
  verdict: 'fiable' | 'incertain' | 'bullshit';
  score: number;
  risk_level: 'low' | 'medium' | 'high';
  reason: string;
  summary: string;
  human_explanation?: string;
  flags: string[];
  requires_external_check: boolean;
  suggested_checks: string[];
  confidence: number;
  model?: string;
  extracted?: {
    content_type: 'text' | 'image' | 'video' | 'link' | 'mixed' | 'unknown';
    main_claim: string;
    key_elements: string[];
    veracity_signals: string[];
    bullshit_signals: string[];
    evidence_for: string[];
    evidence_against: string[];
    media_notes: string[];
    comment_signals: string[];
    missing_context: string[];
  };
  context?: {
    dates: string[];
    locations: string[];
    source_name: string;
    source_url: string;
    original_url: string;
    context_quality: 'good' | 'partial' | 'weak';
    economical_queries: string[];
  };
  quota?: {
    allowed?: boolean;
    reason?: string | null;
    plan?: {
      id?: string;
      name?: string;
      monthly_request_limit?: number;
      weekly_request_limit?: number;
      hourly_request_limit?: number;
      weekly_ai_budget_cents?: number;
    };
    usage?: {
      month?: {
        used_analyses?: number;
        window_started_at?: string;
        reset_at?: string;
      };
      week?: {
        used_analyses?: number;
        used_budget_cents?: number;
        window_started_at?: string;
        reset_at?: string;
      };
      hour?: {
        used_analyses?: number;
        window_started_at?: string;
        reset_at?: string;
      };
    };
  };
  server?: {
    function_version?: string;
    latency_ms?: number;
  };
};

type ExtractedAiInformation = NonNullable<AdvancedAiAnalysis['extracted']>;
type AiContextInformation = NonNullable<AdvancedAiAnalysis['context']>;

export class AdvancedAiRequestError extends Error {
  code: string;
  status?: number;
  endpoint?: string;

  constructor(message: string, { code, status, endpoint }: { code: string; status?: number; endpoint?: string }) {
    super(message);
    this.name = 'AdvancedAiRequestError';
    this.code = code;
    this.status = status;
    this.endpoint = endpoint;
  }
}

export function getBackendUrl() {
  const backendUrl = Constants.expoConfig?.extra?.backendUrl;
  return typeof backendUrl === 'string' ? backendUrl.trim() : '';
}

function getDirectGatewayConfig() {
  const extra = Constants.expoConfig?.extra;

  return {
    enabled: extra?.aiGatewayDirect === true,
    apiKey: typeof extra?.aiGatewayApiKey === 'string' ? extra.aiGatewayApiKey.trim() : '',
    researchModel:
      typeof extra?.aiGatewayResearchModel === 'string'
        ? extra.aiGatewayResearchModel.trim()
        : 'google/gemini-2.5-flash-lite',
    analysisModel:
      typeof extra?.aiGatewayAnalysisModel === 'string'
        ? extra.aiGatewayAnalysisModel.trim()
        : 'google/gemini-2.5-flash-lite',
  };
}

export function getAiRuntimeLabel() {
  if (usesSupabaseAnalyzeBackend()) {
    return 'Supabase Edge Function (server quotas)';
  }

  const directGateway = getDirectGatewayConfig();

  if (directGateway.enabled) {
    return `Direct Vercel AI Gateway (${directGateway.analysisModel})`;
  }

  return getBackendUrl() || 'not configured';
}

export function usesSupabaseAnalyzeBackend() {
  return isSupabaseConfigured();
}

export async function analyzeWithAdvancedAi({
  content,
  language,
  urlContext,
  task = 'analysis',
  userQuestion,
  inputKind,
}: {
  content: string;
  language: Language;
  urlContext?: SocialUrlContext | null;
  task?: 'research' | 'analysis';
  userQuestion?: string;
  inputKind?: 'text' | 'url' | 'combined' | 'share';
}): Promise<AdvancedAiAnalysis | null> {
  if (usesSupabaseAnalyzeBackend()) {
    return analyzeWithSupabaseFunction({
      content,
      language,
      urlContext,
      task,
      userQuestion,
      inputKind,
    });
  }

  const directGateway = getDirectGatewayConfig();

  if (directGateway.enabled) {
    return analyzeWithDirectGateway({
      content,
      language,
      urlContext,
      task,
      userQuestion,
      apiKey: directGateway.apiKey,
      model: task === 'research' ? directGateway.researchModel : directGateway.analysisModel,
    });
  }

  const backendUrl = getBackendUrl();

  if (!backendUrl) {
    console.log('[BullshitDetector] Advanced AI skipped: backend_not_configured');
    throw new AdvancedAiRequestError('Backend URL is not configured.', {
      code: 'backend_not_configured',
    });
  }

  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/ai/analyze`;
  console.log('[BullshitDetector] Advanced AI request', {
    endpoint,
    task,
    platform: urlContext?.platform ?? null,
    hasComments: Boolean(urlContext?.comments?.length),
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        task,
        language,
        sourceUrl: urlContext?.url,
        platform: urlContext?.platform,
        conversationId: urlContext?.conversationId,
        comments: urlContext?.comments ?? [],
        userQuestion,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.log('[BullshitDetector] Advanced AI failed', {
        status: response.status,
        error: data?.error,
        message: data?.message,
      });
      throw new AdvancedAiRequestError(data?.message ?? data?.error ?? 'Advanced AI request failed.', {
        code: data?.error ?? 'backend_error',
        status: response.status,
        endpoint,
      });
    }

    console.log('[BullshitDetector] Advanced AI result', data);
    return data as AdvancedAiAnalysis;
  } catch (error) {
    if (error instanceof AdvancedAiRequestError) {
      throw error;
    }

    console.log('[BullshitDetector] Advanced AI network error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      endpoint,
    });
    throw new AdvancedAiRequestError(error instanceof Error ? error.message : 'Network error.', {
      code: 'network_error',
      endpoint,
    });
  }
}

async function analyzeWithSupabaseFunction({
  content,
  language,
  urlContext,
  task,
  userQuestion,
  inputKind,
}: {
  content: string;
  language: Language;
  urlContext?: SocialUrlContext | null;
  task: 'research' | 'analysis';
  userQuestion?: string;
  inputKind?: 'text' | 'url' | 'combined' | 'share';
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new AdvancedAiRequestError(sessionError?.message ?? 'Supabase session required.', {
      code: 'supabase_session_required',
    });
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/analyze`;
  console.log('[BullshitDetector] Supabase AI analyze request', {
    endpoint,
    task,
    platform: urlContext?.platform ?? null,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        task,
        language,
        sourceUrl: urlContext?.url,
        platform: urlContext?.platform,
        conversationId: urlContext?.conversationId,
        comments: urlContext?.comments ?? [],
        userQuestion,
        inputKind: inputKind ?? (urlContext?.url ? 'url' : 'text'),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.log('[BullshitDetector] Supabase AI analyze failed', {
        status: response.status,
        error: data?.error,
        reason: data?.reason,
      });
      throw new AdvancedAiRequestError(data?.message ?? data?.reason ?? data?.error ?? 'Supabase AI request failed.', {
        code: data?.error ?? data?.reason ?? 'supabase_function_error',
        status: response.status,
        endpoint,
      });
    }

    console.log('[BullshitDetector] Supabase AI analyze result', {
      score: data?.score,
      verdict: data?.verdict,
      quota: data?.quota,
      server: data?.server,
    });

    return normalizeAdvancedAiResult(data as Partial<AdvancedAiAnalysis>, {
      task,
      model: typeof data?.model === 'string' ? data.model : 'supabase-edge',
    });
  } catch (error) {
    if (error instanceof AdvancedAiRequestError) {
      throw error;
    }

    console.log('[BullshitDetector] Supabase AI network error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      endpoint,
    });
    throw new AdvancedAiRequestError(error instanceof Error ? error.message : 'Supabase AI network error.', {
      code: 'network_error',
      endpoint,
    });
  }
}

async function analyzeWithDirectGateway({
  content,
  language,
  urlContext,
  task,
  userQuestion,
  apiKey,
  model,
}: {
  content: string;
  language: Language;
  urlContext?: SocialUrlContext | null;
  task: 'research' | 'analysis';
  userQuestion?: string;
  apiKey: string;
  model: string;
}) {
  const endpoint = 'https://ai-gateway.vercel.sh/v1/chat/completions';

  if (!apiKey) {
    throw new AdvancedAiRequestError('Direct AI Gateway mode is enabled but the public key is missing.', {
      code: 'direct_gateway_key_missing',
      endpoint,
    });
  }

  console.log('[BullshitDetector] Direct AI Gateway request', {
    endpoint,
    task,
    model,
    platform: urlContext?.platform ?? null,
    warning: 'Direct mobile mode exposes the AI Gateway key. Use only for MVP/dev.',
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              task === 'research'
                ? 'Tu es un moteur de contextualisation prudente pour une application mobile. Tu dois repondre uniquement avec un objet JSON valide, sans markdown, sans texte autour. Ne pretends jamais avoir verifie une source absente. Reste compact: 1 phrase de resume, 2 phrases max pour human_explanation, 3 items max par liste.'
                : 'Tu es un moteur d’analyse de fiabilite pour une application mobile. Tu dois repondre uniquement avec un objet JSON valide, sans markdown, sans texte autour. Si le contenu necessite une verification externe, verdict="incertain" et requires_external_check=true. Reste compact: 1 phrase de resume, 2 phrases max pour human_explanation, 3 items max par liste.',
          },
          {
            role: 'user',
            content: buildDirectGatewayPrompt({ content, language, urlContext, task, userQuestion }),
          },
        ],
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.log('[BullshitDetector] Direct AI Gateway failed', {
        status: response.status,
        error: data?.error,
      });
      throw new AdvancedAiRequestError(data?.error?.message ?? 'Direct AI Gateway request failed.', {
        code: data?.error?.code ?? data?.error?.type ?? 'direct_gateway_error',
        status: response.status,
        endpoint,
      });
    }

    const rawContent = data?.choices?.[0]?.message?.content;
    const parsed = normalizeAdvancedAiResult(parseJsonContent(rawContent), { task, model });

    console.log('[BullshitDetector] Direct AI Gateway result', parsed);
    return parsed;
  } catch (error) {
    if (error instanceof AdvancedAiRequestError) {
      throw error;
    }

    console.log('[BullshitDetector] Direct AI Gateway network/parse error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      endpoint,
    });
    throw new AdvancedAiRequestError(error instanceof Error ? error.message : 'Direct Gateway error.', {
      code: 'direct_gateway_error',
      endpoint,
    });
  }
}

function buildDirectGatewayPrompt({
  content,
  language,
  urlContext,
  task,
  userQuestion,
}: {
  content: string;
  language: Language;
  urlContext?: SocialUrlContext | null;
  task: 'research' | 'analysis';
  userQuestion?: string;
}) {
  return [
    `Langue de reponse: ${language}`,
    `Date actuelle ISO: ${new Date().toISOString()}`,
    `Tache: ${task}`,
    userQuestion ? `Question prioritaire de l'utilisateur: ${userQuestion}` : '',
    urlContext?.platform ? `Plateforme: ${urlContext.platform}` : '',
    urlContext?.url ? `URL: ${urlContext.url}` : '',
    urlContext?.conversationId ? `conversation_id: ${urlContext.conversationId}` : '',
    urlContext?.comments?.length ? `Commentaires disponibles:\n- ${urlContext.comments.join('\n- ')}` : '',
    'Retourne uniquement ce JSON valide, sans markdown:',
    `{
  "verdict": "fiable" | "incertain" | "bullshit",
  "score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "reason": "explication courte",
  "summary": "resume humain centre sur la question utilisateur si fournie",
  "human_explanation": "reponse courte et utile a la question utilisateur: oui/non/incertain si possible, pourquoi, ce qui manque",
  "flags": ["clickbait" | "arnaque" | "manipulation" | "fake_news" | "non_verifiable" | "missing_context"],
  "requires_external_check": true,
  "suggested_checks": ["verification concrete"],
  "confidence": 0.0-1.0,
  "extracted": {
    "content_type": "text" | "image" | "video" | "link" | "mixed" | "unknown",
    "main_claim": "these principale",
    "key_elements": ["tableau de textes uniquement"],
    "veracity_signals": ["tableau de textes uniquement"],
    "bullshit_signals": ["tableau de textes uniquement"],
    "evidence_for": ["tableau de textes uniquement"],
    "evidence_against": ["tableau de textes uniquement"],
    "media_notes": ["tableau de textes uniquement"],
    "comment_signals": ["tableau de textes uniquement"],
    "missing_context": ["tableau de textes uniquement"]
  },
  "context": {
    "dates": ["dates detectees ou utiles"],
    "locations": ["lieux detectes ou utiles"],
    "source_name": "nom de la source publiante si detecte",
    "source_url": "url de la source publiante si detectee",
    "original_url": "url originale ou url la plus probable du contenu",
    "context_quality": "good" | "partial" | "weak",
    "economical_queries": ["2 ou 3 requetes courtes pour retrouver la source originale ou verifier l'info"]
  }
}`,
    `Contenu a analyser:\n${content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseJsonContent(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('AI Gateway response has no message content.');
  }

  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(cleaned) as Partial<AdvancedAiAnalysis>;
}

function normalizeAdvancedAiResult(
  value: Partial<AdvancedAiAnalysis>,
  { task, model }: { task: 'research' | 'analysis'; model: string },
): AdvancedAiAnalysis {
  const extracted = normalizeExtractedInformation(value.extracted);
  const context = normalizeContextInformation(value.context);

  return {
    task,
    model,
    verdict: value.verdict ?? 'incertain',
    score: clampNumber(value.score, 0, 100, 50),
    risk_level: value.risk_level ?? 'medium',
    reason: value.reason ?? 'Analyse IA incomplete.',
    summary: value.summary ?? 'Aucun resume IA exploitable.',
    human_explanation:
      value.human_explanation ??
      buildFallbackHumanExplanation({
        verdict: value.verdict,
        reason: value.reason,
        summary: value.summary,
        extracted,
      }),
    flags: normalizeStringArray(value.flags, ['missing_context']),
    requires_external_check: value.requires_external_check ?? true,
    suggested_checks: normalizeStringArray(value.suggested_checks),
    confidence: clampNumber(value.confidence, 0, 1, 0.4),
    extracted,
    context,
    quota: value.quota,
    server: value.server,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function buildFallbackHumanExplanation({
  verdict,
  reason,
  summary,
  extracted,
}: {
  verdict?: AdvancedAiAnalysis['verdict'];
  reason?: string;
  summary?: string;
  extracted: ExtractedAiInformation;
}) {
  const signals = [
    ...extracted.bullshit_signals,
    ...extracted.evidence_against,
    ...extracted.missing_context,
  ].slice(0, 2);
  const base = reason || summary || 'Analyse IA incomplete.';
  const qualifier =
    verdict === 'fiable'
      ? 'Le contenu semble plutot coherent avec les elements disponibles.'
      : verdict === 'bullshit'
        ? 'Le contenu presente des signaux forts de doute ou de manipulation.'
        : 'La conclusion reste incertaine avec les elements disponibles.';

  return signals.length ? `${qualifier} ${base} Points a verifier: ${signals.join(' ')}` : `${qualifier} ${base}`;
}

function normalizeExtractedInformation(value: unknown): ExtractedAiInformation {
  const raw = isRecord(value) ? value : {};

  return {
    content_type: normalizeContentType(raw.content_type),
    main_claim: typeof raw.main_claim === 'string' && raw.main_claim.trim() ? raw.main_claim : 'These non extraite.',
    key_elements: normalizeStringArray(raw.key_elements),
    veracity_signals: normalizeStringArray(raw.veracity_signals),
    bullshit_signals: normalizeStringArray(raw.bullshit_signals),
    evidence_for: normalizeStringArray(raw.evidence_for),
    evidence_against: normalizeStringArray(raw.evidence_against),
    media_notes: normalizeStringArray(raw.media_notes),
    comment_signals: normalizeStringArray(raw.comment_signals),
    missing_context: normalizeStringArray(raw.missing_context, ['Contexte IA incomplet.']),
  };
}

function normalizeContextInformation(value: unknown): AiContextInformation {
  const raw = isRecord(value) ? value : {};

  return {
    dates: normalizeStringArray(raw.dates).slice(0, 4),
    locations: normalizeStringArray(raw.locations).slice(0, 4),
    source_name: normalizeString(raw.source_name),
    source_url: normalizeString(raw.source_url),
    original_url: normalizeString(raw.original_url),
    context_quality:
      raw.context_quality === 'good' || raw.context_quality === 'partial' || raw.context_quality === 'weak'
        ? raw.context_quality
        : 'weak',
    economical_queries: normalizeStringArray(raw.economical_queries).slice(0, 3),
  };
}

function normalizeContentType(value: unknown): ExtractedAiInformation['content_type'] {
  return value === 'text' ||
    value === 'image' ||
    value === 'video' ||
    value === 'link' ||
    value === 'mixed' ||
    value === 'unknown'
    ? value
    : 'unknown';
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return fallback;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
