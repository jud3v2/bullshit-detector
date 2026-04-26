export type SharedPayloadLike = {
  value?: string | null;
  shareType?: string | null;
  mimeType?: string | null;
  contentUri?: string | null;
  contentType?: string | null;
};

export type ExtractedShare = {
  text: string;
  link: string;
  combined: string;
  sourceLabel: string;
};

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

function cleanValue(value: string | null | undefined) {
  return (value ?? '').trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function extractFirstUrl(value: string) {
  const match = value.match(URL_PATTERN);
  return match?.[0] ?? '';
}

export function extractSharedContent(
  rawPayloads: SharedPayloadLike[] = [],
  resolvedPayloads: SharedPayloadLike[] = [],
): ExtractedShare | null {
  const payloads = [...rawPayloads, ...resolvedPayloads];
  const values = unique(payloads.map((payload) => cleanValue(payload.value)));
  const uris = unique(payloads.map((payload) => cleanValue(payload.contentUri)));
  const link =
    values.find((value) => payloadLooksLikeUrl(value)) ??
    uris.find((value) => payloadLooksLikeUrl(value)) ??
    values.map(extractFirstUrl).find(Boolean) ??
    '';
  const text = values.find((value) => value && value !== link && !payloadLooksLikeUrl(value)) ?? '';
  const combined = unique([text, link]).join('\n\n').trim();

  if (!combined) {
    return null;
  }

  return {
    text,
    link,
    combined,
    sourceLabel: text && link ? 'Texte et lien recus' : link ? 'Lien recu' : 'Texte recu',
  };
}

export function payloadLooksLikeUrl(value: string) {
  return URL_PATTERN.test(value.trim()) && value.trim().replace(URL_PATTERN, '').trim().length === 0;
}
