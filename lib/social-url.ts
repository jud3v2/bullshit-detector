import Constants from 'expo-constants';

import type { Language } from './i18n';

export type SocialPlatform =
  | 'TikTok'
  | 'Instagram'
  | 'X / Twitter'
  | 'Facebook'
  | 'LinkedIn'
  | 'Reddit'
  | 'YouTube Shorts'
  | 'Threads'
  | 'Leboncoin'
  | 'Other link';

export type SocialUrlContext = {
  url: string;
  platform: SocialPlatform;
  postId: string;
  conversationId: string;
  conversationIdSource: 'url-post-id' | 'official-api' | 'unavailable';
  fetched: boolean;
  fetchedAt: string;
  title: string;
  description: string;
  visibleText: string;
  summary: string;
  comments: string[];
  commentsSummary: string;
  limitation: string;
  attempts: SocialFetchAttempt[];
};

export type SocialFetchAttempt = {
  source: string;
  ok: boolean;
  status?: number;
  elapsedMs: number;
  extractedCharacters: number;
  error?: string;
  quotaRemaining?: number;
  quotaResetAt?: string;
};

const SOCIAL_HOSTS: Array<{ platform: SocialPlatform; pattern: RegExp }> = [
  { platform: 'TikTok', pattern: /(^|\.)tiktok\.com$/i },
  { platform: 'Instagram', pattern: /(^|\.)instagram\.com$/i },
  { platform: 'X / Twitter', pattern: /(^|\.)x\.com$|(^|\.)twitter\.com$/i },
  { platform: 'Facebook', pattern: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/i },
  { platform: 'LinkedIn', pattern: /(^|\.)linkedin\.com$/i },
  { platform: 'Reddit', pattern: /(^|\.)reddit\.com$|(^|\.)redd\.it$/i },
  { platform: 'YouTube Shorts', pattern: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i },
  { platform: 'Threads', pattern: /(^|\.)threads\.net$/i },
  { platform: 'Leboncoin', pattern: /(^|\.)leboncoin\.fr$/i },
];

const COMMENT_MARKERS = /\b(commentaire|comment|reply|replies|discussion|upvote|downvote|likes?|shares?)\b/i;
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const URL_GLOBAL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export function extractUrls(value: string) {
  const matches = value.match(URL_GLOBAL_PATTERN) ?? [];
  const seen = new Set<string>();

  return matches
    .map((match) => match.replace(/[),.;!?]+$/g, ''))
    .filter((match) => {
      const normalized = normalizeUrl(match);

      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

export function containsUrl(value: string) {
  return extractUrls(value).length > 0;
}

export function isSingleUrl(value: string) {
  const trimmed = value.trim();
  return URL_PATTERN.test(trimmed) && trimmed.replace(URL_PATTERN, '').trim().length === 0;
}

export function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function detectPlatform(value: string): SocialPlatform {
  try {
    const host = new URL(normalizeUrl(value)).hostname.replace(/^www\./, '');
    return SOCIAL_HOSTS.find((entry) => entry.pattern.test(host))?.platform ?? 'Other link';
  } catch {
    return 'Other link';
  }
}

export async function analyzeSocialUrl(value: string, language: Language = 'en'): Promise<SocialUrlContext> {
  const url = normalizeUrl(value);
  const platform = detectPlatform(url);
  const postId = extractPlatformPostId(url, platform);
  const conversationId = platform === 'X / Twitter' && postId ? postId : '';
  const conversationIdSource = conversationId ? 'url-post-id' : 'unavailable';

  if (!url) {
    return emptyContext('', 'Other link', language === 'fr' ? 'Aucune URL exploitable.' : 'No usable URL.');
  }

  const candidates = buildFetchCandidates(url, platform);
  const extracted = await Promise.all(candidates.map((candidate) => fetchCandidate(candidate)));
  let attempts = extracted.map((entry) => entry.attempt);
  const title = firstNonEmpty(extracted.flatMap((entry) => [entry.title, entry.author]));
  const description = firstNonEmpty(extracted.map((entry) => entry.description));
  const visibleText = summarizeText(extracted.map((entry) => entry.visibleText).filter(Boolean).join(' '), 760);
  const summary = summarizeText(firstNonEmpty([description, visibleText, title]), 360);
  let comments = extracted.flatMap((entry) => entry.comments).slice(0, 12);

  if (platform === 'X / Twitter' && conversationId && comments.length === 0) {
    const officialReplies = await fetchOfficialXReplies(conversationId);
    attempts = [...attempts, officialReplies.attempt];
    comments = officialReplies.comments.slice(0, 12);
  }

  const commentsSummary = summarizeText(
    [...extracted.map((entry) => entry.commentsSummary).filter(Boolean), ...comments].join(' '),
    320,
  );
  const hasUsefulText = Boolean(title || description || visibleText || commentsSummary);

  if (hasUsefulText) {
    return {
      url,
      platform,
      postId,
      conversationId,
      conversationIdSource: conversationIdSource as SocialUrlContext['conversationIdSource'],
      fetched: true,
      fetchedAt: new Date().toISOString(),
      title,
      description,
      visibleText,
      summary:
        summary ||
        (language === 'fr'
          ? 'Le lien est accessible, mais il contient peu de texte public exploitable.'
          : 'The link is accessible, but it contains little usable public text.'),
      comments,
      commentsSummary,
      limitation: commentsSummary
        ? language === 'fr'
          ? 'Les commentaires detectes proviennent uniquement de sources publiques ou du backend officiel configure.'
          : 'Detected comments come only from public sources or the configured official backend.'
        : language === 'fr'
          ? 'Commentaires non accessibles depuis cette URL dans ce MVP. Beaucoup de reseaux les cachent derriere leur app, une connexion ou du JavaScript.'
          : 'Comments unavailable from this URL in the MVP. Many platforms hide them behind their app, login, or JavaScript.',
      attempts,
    };
  }

  return emptyContext(
    url,
    platform,
    language === 'fr'
      ? "Impossible de recuperer les donnees publiques de cette URL. L'analyse se limite au lien, a la plateforme et aux signaux visibles."
      : 'Could not retrieve public data from this URL. The analysis is limited to the link, platform, and visible signals.',
    attempts,
  );
}

export function buildUrlAnalysisInput(
  context: SocialUrlContext,
  language: Language = 'en',
  sessionContext?: string,
) {
  return [
    `${language === 'fr' ? 'Plateforme' : 'Platform'}: ${context.platform}`,
    `URL: ${context.url}`,
    context.conversationId ? `conversation_id: ${context.conversationId}` : '',
    sessionContext ? `${language === 'fr' ? 'Contexte session' : 'Session context'}: ${sessionContext}` : '',
    context.title ? `${language === 'fr' ? 'Titre' : 'Title'}: ${context.title}` : '',
    context.description ? `Description: ${context.description}` : '',
    context.summary ? `${language === 'fr' ? 'Resume public' : 'Public summary'}: ${context.summary}` : '',
    context.commentsSummary
      ? `${language === 'fr' ? 'Commentaires publics' : 'Public comments'}: ${context.commentsSummary}`
      : '',
    context.comments.length
      ? `${language === 'fr' ? 'Commentaires extraits' : 'Extracted comments'}: ${context.comments.join(' | ')}`
      : '',
    context.attempts.length
      ? `${language === 'fr' ? 'Tentatives de collecte' : 'Collection attempts'}: ${formatAttempts(context.attempts)}`
      : '',
    `${language === 'fr' ? 'Limite' : 'Limit'}: ${context.limitation}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function emptyContext(
  url: string,
  platform: SocialPlatform,
  limitation: string,
  attempts: SocialFetchAttempt[] = [],
): SocialUrlContext {
  return {
    url,
    platform,
    postId: extractPlatformPostId(url, platform),
    conversationId:
      platform === 'X / Twitter' && extractPlatformPostId(url, platform)
        ? extractPlatformPostId(url, platform)
        : '',
    conversationIdSource:
      platform === 'X / Twitter' && extractPlatformPostId(url, platform)
        ? 'url-post-id'
        : 'unavailable',
    fetched: false,
    fetchedAt: new Date().toISOString(),
    title: '',
    description: '',
    visibleText: '',
    summary: limitation.startsWith('Aucune') || limitation.startsWith('Impossible')
      ? 'Aucun contenu public exploitable n’a ete recupere automatiquement.'
      : 'No usable public content was retrieved automatically.',
    comments: [],
    commentsSummary: '',
    limitation,
    attempts,
  };
}

export function extractPlatformPostId(value: string, platform = detectPlatform(value)) {
  if (platform === 'X / Twitter') {
    return normalizeUrl(value).match(/status\/(\d+)/)?.[1] ?? '';
  }

  return '';
}

type FetchCandidate = {
  source: string;
  url: string;
  kind: 'html' | 'oembed' | 'json';
};

type CandidateResult = {
  title: string;
  author: string;
  description: string;
  visibleText: string;
  comments: string[];
  commentsSummary: string;
  attempt: SocialFetchAttempt;
};

type OfficialRepliesResult = {
  comments: string[];
  attempt: SocialFetchAttempt;
};

function buildFetchCandidates(url: string, platform: SocialPlatform): FetchCandidate[] {
  const encodedUrl = encodeURIComponent(url);
  const candidates: FetchCandidate[] = [{ source: 'canonical-html', url, kind: 'html' }];

  if (platform === 'X / Twitter') {
    candidates.push({
      source: 'x-public-oembed',
      url: `https://publish.twitter.com/oembed?url=${encodedUrl}&omit_script=true`,
      kind: 'oembed',
    });
  }

  if (platform === 'TikTok') {
    candidates.push({
      source: 'tiktok-public-oembed',
      url: `https://www.tiktok.com/oembed?url=${encodedUrl}`,
      kind: 'oembed',
    });
  }

  if (platform === 'YouTube Shorts') {
    candidates.push({
      source: 'youtube-public-oembed',
      url: `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`,
      kind: 'oembed',
    });
  }

  if (platform === 'Reddit') {
    candidates.push({
      source: 'reddit-public-oembed',
      url: `https://www.reddit.com/oembed?url=${encodedUrl}`,
      kind: 'oembed',
    });
  }

  if (platform === 'Facebook') {
    candidates.push({
      source: 'facebook-public-oembed',
      url: `https://www.facebook.com/plugins/post/oembed.json/?url=${encodedUrl}`,
      kind: 'oembed',
    });
  }

  if (platform === 'Leboncoin') {
    candidates.push({
      source: 'leboncoin-html-with-tracking-cleanup',
      url: stripTrackingParams(url),
      kind: 'html',
    });
  }

  return candidates;
}

async function fetchCandidate(candidate: FetchCandidate): Promise<CandidateResult> {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(candidate.url, 9000);
    const body = await response.text();
    const result = candidate.kind === 'html' ? parseHtmlCandidate(body) : parseOembedCandidate(body);
    const extractedCharacters = [
      result.title,
      result.author,
      result.description,
      result.visibleText,
      result.comments.join(' '),
      result.commentsSummary,
    ].join(' ').length;

    return {
      ...result,
      attempt: {
        source: candidate.source,
        ok: response.ok && extractedCharacters > 0,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        extractedCharacters,
      },
    };
  } catch (error) {
    return {
      title: '',
      author: '',
      description: '',
      visibleText: '',
      commentsSummary: '',
      comments: [],
      attempt: {
        source: candidate.source,
        ok: false,
        elapsedMs: Date.now() - startedAt,
        extractedCharacters: 0,
        error: error instanceof Error ? error.message : 'Unknown fetch error',
      },
    };
  }
}

async function fetchOfficialXReplies(conversationId: string): Promise<OfficialRepliesResult> {
  const startedAt = Date.now();
  const backendUrl = getBackendUrl();

  if (!backendUrl) {
    return {
      comments: [],
      attempt: {
        source: 'x-official-backend',
        ok: false,
        elapsedMs: 0,
        extractedCharacters: 0,
        error: 'backend_not_configured',
      },
    };
  }

  try {
    const endpoint = `${backendUrl.replace(/\/$/, '')}/api/social/x/replies?conversation_id=${encodeURIComponent(
      conversationId,
    )}&limit=12`;
    const response = await fetchWithTimeout(endpoint, 10000);
    const data = safeParseJson<{
      comments?: string[];
      replies?: Array<{ text?: string }>;
      tweets?: Array<{ text?: string }>;
      quota?: { remaining?: number; resetAt?: string };
      error?: string;
    }>(await response.text());
    const comments = [
      ...(data.comments ?? []),
      ...(data.replies ?? []).map((reply) => reply.text ?? ''),
      ...(data.tweets ?? []).map((tweet) => tweet.text ?? ''),
    ]
      .map((comment) => summarizeText(comment, 260))
      .filter(Boolean)
      .slice(0, 12);

    return {
      comments,
      attempt: {
        source: 'x-official-backend',
        ok: response.ok && comments.length > 0,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        extractedCharacters: comments.join(' ').length,
        error: response.ok ? data.error : data.error ?? `backend_http_${response.status}`,
        quotaRemaining: data.quota?.remaining,
        quotaResetAt: data.quota?.resetAt,
      },
    };
  } catch (error) {
    return {
      comments: [],
      attempt: {
        source: 'x-official-backend',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        extractedCharacters: 0,
        error: error instanceof Error ? error.message : 'backend_fetch_failed',
      },
    };
  }
}

function getBackendUrl() {
  const backendUrl = Constants.expoConfig?.extra?.backendUrl;
  return typeof backendUrl === 'string' ? backendUrl.trim() : '';
}

function parseHtmlCandidate(html: string) {
  const title = firstNonEmpty([
    readMeta(html, 'og:title'),
    readMeta(html, 'twitter:title'),
    readTitle(html),
  ]);
  const description = firstNonEmpty([
    readMeta(html, 'og:description'),
    readMeta(html, 'twitter:description'),
    readMeta(html, 'description'),
  ]);

  const comments = extractCommentSnippets(html);

  return {
    title,
    author: firstNonEmpty([readMeta(html, 'author'), readMeta(html, 'twitter:creator')]),
    description,
    visibleText: summarizeText(extractVisibleText(html), 760),
    comments,
    commentsSummary: summarizeText(comments.join(' '), 260),
  };
}

function parseOembedCandidate(body: string) {
  const data = safeParseJson<Record<string, unknown>>(body);
  const html = typeof data.html === 'string' ? data.html : '';
  const title = typeof data.title === 'string' ? decodeHtml(data.title) : '';
  const author = typeof data.author_name === 'string' ? decodeHtml(data.author_name) : '';
  const provider = typeof data.provider_name === 'string' ? decodeHtml(data.provider_name) : '';
  const visibleText = summarizeText(extractVisibleText(html), 760);

  return {
    title,
    author,
    description: firstNonEmpty([visibleText, provider]),
    visibleText,
    comments: extractCommentSnippets(html),
    commentsSummary: extractCommentsSummary(html),
  };
}

function safeParseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function formatAttempts(attempts: SocialFetchAttempt[]) {
  return attempts
    .map((attempt) => {
      const status = attempt.status ? ` status=${attempt.status}` : '';
      const error = attempt.error ? ` error=${attempt.error}` : '';
      return `${attempt.source} ok=${attempt.ok}${status} chars=${attempt.extractedCharacters} time=${attempt.elapsedMs}ms${error}`;
    })
    .join('; ');
}

function stripTrackingParams(value: string) {
  try {
    const url = new URL(value);

    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igshid|s|ref)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return value;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'BullshitDetectorMVP/1.0',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function readTitle(html: string) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
}

function readMeta(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapedName}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapedName}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];

    if (match) {
      return decodeHtml(match);
    }
  }

  return '';
}

function extractVisibleText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function extractCommentsSummary(html: string) {
  return summarizeText(extractCommentSnippets(html).join('. '), 260);
}

function extractCommentSnippets(html: string) {
  const text = extractVisibleText(html);

  if (!COMMENT_MARKERS.test(text)) {
    return [];
  }

  return [...new Set(
    text
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => COMMENT_MARKERS.test(sentence) && sentence.length > 30)
    .map((sentence) => summarizeText(sentence, 220)),
  )].slice(0, 8);
}

function summarizeText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, ' ').trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function firstNonEmpty(values: string[]) {
  return values.map((value) => value.trim()).find(Boolean) ?? '';
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
