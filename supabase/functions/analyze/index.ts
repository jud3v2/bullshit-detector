import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Language = 'en' | 'fr';
type Task = 'research' | 'analysis';

type AnalyzeRequest = {
  content?: string;
  task?: Task;
  language?: Language;
  sourceUrl?: string;
  platform?: string;
  conversationId?: string;
  comments?: string[];
  userQuestion?: string;
  inputKind?: 'text' | 'url' | 'combined' | 'share';
};

type AiResult = {
  task?: Task;
  verdict: 'fiable' | 'incertain' | 'bullshit';
  score: number;
  risk_level: 'low' | 'medium' | 'high';
  reason: string;
  summary: string;
  human_explanation: string;
  flags: string[];
  requires_external_check: boolean;
  suggested_checks: string[];
  confidence: number;
  model?: string;
  extracted: {
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
  context: {
    dates: string[];
    locations: string[];
    source_name: string;
    source_url: string;
    original_url: string;
    context_quality: 'good' | 'partial' | 'weak';
    economical_queries: string[];
  };
  quota?: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AI_ANALYSIS_COST_CENTS = 8;
const FUNCTION_VERSION = 'server-analysis-v1';
const GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const aiGatewayKey = Deno.env.get('AI_GATEWAY_API_KEY') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'supabase_env_missing' }, 500);
  }

  if (!aiGatewayKey) {
    return json({ error: 'ai_gateway_key_missing' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: 'unauthorized', message: userError?.message ?? 'User session required.' }, 401);
    }

    const payload = validatePayload(await req.json());
    const profile = await adminClient
      .from('profiles')
      .select('terms_accepted_at, terms_version, account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profile.error) {
      return json({ error: 'profile_lookup_failed', message: profile.error.message }, 500);
    }

    if (profile.data?.account_status && profile.data.account_status !== 'active') {
      return json({ error: 'account_not_active' }, 403);
    }

    if (!profile.data?.terms_accepted_at || !profile.data?.terms_version) {
      return json({ error: 'terms_required' }, 403);
    }

    const quota = await adminClient.rpc('consume_analysis_quota', {
      p_user_id: user.id,
      p_cost_cents: AI_ANALYSIS_COST_CENTS,
    });

    if (quota.error) {
      return json({ error: 'quota_check_failed', message: quota.error.message }, 500);
    }

    const quotaValue = quota.data as { allowed?: boolean; reason?: string } | null;

    if (!quotaValue?.allowed) {
      return json({ error: 'quota_exceeded', reason: quotaValue?.reason ?? 'quota_exceeded', quota: quota.data }, 402);
    }

    const model = selectModel(payload.task);
    const aiResult = await callAiGateway({
      apiKey: aiGatewayKey,
      model,
      payload,
    });
    const inputHash = await sha256(payload.content);
    const latencyMs = Date.now() - startedAt;

    await adminClient.from('analysis_events').insert({
      user_id: user.id,
      mode: 'ai',
      input_kind: payload.inputKind ?? (payload.sourceUrl ? 'url' : 'text'),
      platform: payload.platform ?? null,
      score: aiResult.score,
      risk_level: mapRiskToLocal(aiResult.risk_level),
      credits_used: Math.round(AI_ANALYSIS_COST_CENTS / 2),
      verdict: aiResult.verdict,
      confidence: aiResult.confidence,
      requires_external_check: aiResult.requires_external_check,
      source_url: payload.sourceUrl ?? null,
      input_hash: inputHash,
      input_preview: payload.content.slice(0, 240),
      user_question: payload.userQuestion?.slice(0, 240) ?? null,
      ai_model: model,
      latency_ms: latencyMs,
      function_version: FUNCTION_VERSION,
      metadata: {
        flags: aiResult.flags,
        context: aiResult.context,
        extracted: aiResult.extracted,
        quota: quota.data,
        conversation_id: payload.conversationId ?? null,
        comments_count: payload.comments?.length ?? 0,
      },
    });

    return json({
      ...aiResult,
      task: payload.task,
      model,
      quota: quota.data,
      server: {
        function_version: FUNCTION_VERSION,
        latency_ms: latencyMs,
      },
    });
  } catch (error) {
    return json(
      {
        error: 'analysis_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

function validatePayload(value: unknown): Required<Pick<AnalyzeRequest, 'content' | 'task' | 'language'>> &
  Omit<AnalyzeRequest, 'content' | 'task' | 'language'> {
  const raw = isRecord(value) ? value : {};
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';

  if (!content) {
    throw new Error('content_required');
  }

  if (content.length > 12000) {
    throw new Error('content_too_long');
  }

  const task = raw.task === 'research' || raw.task === 'analysis' ? raw.task : 'analysis';
  const language = raw.language === 'en' || raw.language === 'fr' ? raw.language : 'fr';
  const comments = Array.isArray(raw.comments) ? raw.comments.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
  const inputKind =
    raw.inputKind === 'text' || raw.inputKind === 'url' || raw.inputKind === 'combined' || raw.inputKind === 'share'
      ? raw.inputKind
      : undefined;

  return {
    content,
    task,
    language,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : undefined,
    platform: typeof raw.platform === 'string' ? raw.platform : undefined,
    conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : undefined,
    comments,
    userQuestion: typeof raw.userQuestion === 'string' ? raw.userQuestion.trim().slice(0, 500) : undefined,
    inputKind,
  };
}

async function callAiGateway({
  apiKey,
  model,
  payload,
}: {
  apiKey: string;
  model: string;
  payload: ReturnType<typeof validatePayload>;
}) {
  const response = await fetch(GATEWAY_ENDPOINT, {
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
            payload.task === 'research'
              ? 'Tu es un moteur de contextualisation prudente pour une application mobile. Reponds uniquement en JSON valide. Ne pretends jamais verifier une source absente. Reste compact: 1 phrase de summary, 2 phrases max pour human_explanation, 3 items max par liste.'
              : 'Tu es un moteur d’analyse de fiabilite pour une application mobile. Reponds uniquement en JSON valide. Si le contenu necessite une verification externe, verdict="incertain" et requires_external_check=true. Reste compact: 1 phrase de summary, 2 phrases max pour human_explanation, 3 items max par liste.',
        },
        {
          role: 'user',
          content: buildPrompt(payload),
        },
      ],
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? data?.message ?? 'AI Gateway request failed.');
  }

  return normalizeAiResult(parseJsonContent(data?.choices?.[0]?.message?.content), model);
}

function buildPrompt(payload: ReturnType<typeof validatePayload>) {
  return [
    `Langue de reponse: ${payload.language}`,
    `Date actuelle ISO: ${new Date().toISOString()}`,
    `Tache: ${payload.task}`,
    payload.userQuestion ? `Question prioritaire utilisateur: ${payload.userQuestion}` : '',
    payload.platform ? `Plateforme: ${payload.platform}` : '',
    payload.sourceUrl ? `URL: ${payload.sourceUrl}` : '',
    payload.conversationId ? `conversation_id: ${payload.conversationId}` : '',
    (payload.comments ?? []).length ? `Commentaires disponibles:\n- ${(payload.comments ?? []).join('\n- ')}` : '',
    'Retourne uniquement ce JSON valide, sans markdown:',
    `{
  "verdict": "fiable" | "incertain" | "bullshit",
  "score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "reason": "explication courte",
  "summary": "resume humain centre sur la question utilisateur si fournie",
  "human_explanation": "reponse courte et utile: oui/non/incertain si possible, pourquoi, ce qui manque",
  "flags": ["clickbait" | "arnaque" | "manipulation" | "fake_news" | "non_verifiable" | "missing_context"],
  "requires_external_check": true,
  "suggested_checks": ["verification concrete"],
  "confidence": 0.0-1.0,
  "extracted": {
    "content_type": "text" | "image" | "video" | "link" | "mixed" | "unknown",
    "main_claim": "these principale",
    "key_elements": ["textes uniquement"],
    "veracity_signals": ["textes uniquement"],
    "bullshit_signals": ["textes uniquement"],
    "evidence_for": ["textes uniquement"],
    "evidence_against": ["textes uniquement"],
    "media_notes": ["textes uniquement"],
    "comment_signals": ["textes uniquement"],
    "missing_context": ["textes uniquement"]
  },
  "context": {
    "dates": ["dates detectees"],
    "locations": ["lieux detectes"],
    "source_name": "source publiante si detectee",
    "source_url": "url source si detectee",
    "original_url": "url originale ou probable",
    "context_quality": "good" | "partial" | "weak",
    "economical_queries": ["2 ou 3 requetes courtes"]
  }
}`,
    `Contenu a analyser:\n${payload.content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseJsonContent(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('AI response has no message content.');
  }

  return JSON.parse(value.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim());
}

function normalizeAiResult(value: unknown, model: string): AiResult {
  const raw = isRecord(value) ? value : {};
  const extracted = isRecord(raw.extracted) ? raw.extracted : {};
  const context = isRecord(raw.context) ? raw.context : {};

  return {
    model,
    verdict: raw.verdict === 'fiable' || raw.verdict === 'bullshit' ? raw.verdict : 'incertain',
    score: clampNumber(raw.score, 0, 100, 50),
    risk_level: raw.risk_level === 'low' || raw.risk_level === 'high' ? raw.risk_level : 'medium',
    reason: normalizeString(raw.reason) || 'Analyse IA incomplete.',
    summary: normalizeString(raw.summary) || 'Aucun resume IA exploitable.',
    human_explanation: normalizeString(raw.human_explanation) || normalizeString(raw.reason) || 'Analyse IA incomplete.',
    flags: normalizeStringArray(raw.flags, ['missing_context']).slice(0, 5),
    requires_external_check: typeof raw.requires_external_check === 'boolean' ? raw.requires_external_check : true,
    suggested_checks: normalizeStringArray(raw.suggested_checks).slice(0, 4),
    confidence: clampNumber(raw.confidence, 0, 1, 0.4),
    extracted: {
      content_type: normalizeContentType(extracted.content_type),
      main_claim: normalizeString(extracted.main_claim) || 'These non extraite.',
      key_elements: normalizeStringArray(extracted.key_elements).slice(0, 4),
      veracity_signals: normalizeStringArray(extracted.veracity_signals).slice(0, 4),
      bullshit_signals: normalizeStringArray(extracted.bullshit_signals).slice(0, 4),
      evidence_for: normalizeStringArray(extracted.evidence_for).slice(0, 4),
      evidence_against: normalizeStringArray(extracted.evidence_against).slice(0, 4),
      media_notes: normalizeStringArray(extracted.media_notes).slice(0, 4),
      comment_signals: normalizeStringArray(extracted.comment_signals).slice(0, 4),
      missing_context: normalizeStringArray(extracted.missing_context, ['Contexte IA incomplet.']).slice(0, 4),
    },
    context: {
      dates: normalizeStringArray(context.dates).slice(0, 4),
      locations: normalizeStringArray(context.locations).slice(0, 4),
      source_name: normalizeString(context.source_name),
      source_url: normalizeString(context.source_url),
      original_url: normalizeString(context.original_url),
      context_quality:
        context.context_quality === 'good' || context.context_quality === 'partial' || context.context_quality === 'weak'
          ? context.context_quality
          : 'weak',
      economical_queries: normalizeStringArray(context.economical_queries).slice(0, 3),
    },
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function selectModel(task: Task) {
  if (task === 'research') {
    return Deno.env.get('AI_GATEWAY_RESEARCH_MODEL') ?? Deno.env.get('AI_GATEWAY_MODEL') ?? 'google/gemini-2.5-flash-lite';
  }

  return Deno.env.get('AI_GATEWAY_ANALYSIS_MODEL') ?? Deno.env.get('AI_GATEWAY_MODEL') ?? 'google/gemini-2.5-flash-lite';
}

function mapRiskToLocal(risk: AiResult['risk_level']) {
  if (risk === 'low') return 'faible';
  if (risk === 'high') return 'eleve';
  return 'moyen';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function normalizeContentType(value: unknown): AiResult['extracted']['content_type'] {
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
