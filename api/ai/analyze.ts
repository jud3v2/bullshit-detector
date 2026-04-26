import { gateway } from '@ai-sdk/gateway';
import { generateObject } from 'ai';
import { z } from 'zod';

const requestSchema = z.object({
  content: z.string().min(1).max(12000),
  task: z.enum(['research', 'analysis']).default('analysis'),
  sourceUrl: z.string().optional(),
  platform: z.string().optional(),
  conversationId: z.string().optional(),
  comments: z.array(z.string()).optional(),
  userQuestion: z.string().optional(),
  language: z.enum(['en', 'fr']).default('fr'),
});

const responseSchema = z.object({
  verdict: z.enum(['fiable', 'incertain', 'bullshit']),
  score: z.number().min(0).max(100),
  risk_level: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
  summary: z.string(),
  human_explanation: z.string(),
  flags: z.array(
    z.enum(['clickbait', 'arnaque', 'manipulation', 'fake_news', 'non_verifiable', 'missing_context']),
  ),
  requires_external_check: z.boolean(),
  suggested_checks: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  extracted: z.object({
    content_type: z.enum(['text', 'image', 'video', 'link', 'mixed', 'unknown']),
    main_claim: z.string(),
    key_elements: z.array(z.string()),
    veracity_signals: z.array(z.string()),
    bullshit_signals: z.array(z.string()),
    evidence_for: z.array(z.string()),
    evidence_against: z.array(z.string()),
    media_notes: z.array(z.string()),
    comment_signals: z.array(z.string()),
    missing_context: z.array(z.string()),
  }),
  context: z.object({
    dates: z.array(z.string()),
    locations: z.array(z.string()),
    source_name: z.string(),
    source_url: z.string(),
    original_url: z.string(),
    context_quality: z.enum(['good', 'partial', 'weak']),
    economical_queries: z.array(z.string()),
  }),
});

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: 'ai_gateway_key_missing' }, { status: 500 });
  }

  try {
    const payload = requestSchema.parse(await request.json());
    const model =
      payload.task === 'research'
        ? process.env.AI_GATEWAY_RESEARCH_MODEL ?? process.env.AI_GATEWAY_MODEL ?? 'google/gemini-2.5-flash-lite'
        : process.env.AI_GATEWAY_ANALYSIS_MODEL ?? process.env.AI_GATEWAY_MODEL ?? 'google/gemini-2.5-flash-lite';
    const result = await generateObject({
      model: gateway(model),
      schema: responseSchema,
      system:
        payload.task === 'research'
          ? 'Tu es un moteur de contextualisation prudente pour une application mobile. Resume les elements publics fournis, separe faits observables et incertitudes, et retourne uniquement un JSON conforme au schema. Ne pretends jamais avoir verifie une source absente. Reste compact: 1 phrase de summary, 2 phrases max de human_explanation, 3 items max par liste. Remplis context avec dates, lieux, source, qualite du contexte et 2-3 requetes economiques pour retrouver la source originale ou verifier.'
          : 'Tu es un moteur d’analyse de fiabilite pour une application mobile. Retourne uniquement un JSON conforme au schema. Ne pretends jamais verifier un fait si tu n’as pas acces a une source fiable. Si le contenu necessite une verification externe, marque requires_external_check=true et verdict="incertain". Reste compact: 1 phrase de summary, 2 phrases max de human_explanation, 3 items max par liste. Remplis context avec dates, lieux, source, qualite du contexte et 2-3 requetes economiques pour retrouver la source originale ou verifier.',
      prompt: [
        `Langue de reponse: ${payload.language}`,
        `Date actuelle ISO: ${new Date().toISOString()}`,
        `Tache: ${payload.task}`,
        payload.userQuestion ? `Question prioritaire de l'utilisateur: ${payload.userQuestion}` : '',
        payload.platform ? `Plateforme: ${payload.platform}` : '',
        payload.sourceUrl ? `URL: ${payload.sourceUrl}` : '',
        payload.conversationId ? `conversation_id: ${payload.conversationId}` : '',
        payload.comments?.length ? `Commentaires disponibles:\n- ${payload.comments.join('\n- ')}` : '',
        `Contenu a analyser:\n${payload.content}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    return Response.json({
      ...result.object,
      task: payload.task,
      model,
      usage: result.usage,
    });
  } catch (error) {
    return Response.json(
      {
        error: 'ai_analysis_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
