# Social Backend Contract

The mobile app must never store provider API tokens. Official provider credentials stay on the backend.

## X Replies

Endpoint:

```txt
GET /api/social/x/replies?conversation_id=<x_conversation_id>&limit=12
```

Backend behavior:

- Use the official X API with a server-held bearer token.
- Query public replies with `conversation_id:<id>`.
- Enforce app-level quotas and provider-cost limits.
- Return only normalized public reply text and quota metadata.
- Never return API credentials, cookies, or session secrets.

Response:

```json
{
  "comments": ["Public reply text"],
  "quota": {
    "remaining": 42,
    "resetAt": "2026-04-26T12:00:00.000Z"
  }
}
```

Error response:

```json
{
  "comments": [],
  "error": "quota_exceeded",
  "quota": {
    "remaining": 0,
    "resetAt": "2026-04-26T12:00:00.000Z"
  }
}
```

Recommended status codes:

- `200`: replies returned or no replies found
- `402`: provider-cost budget exhausted
- `429`: rate limited
- `403`: provider permission missing
- `502`: provider API failure

## Advanced AI Analysis

Endpoint:

```txt
POST /api/ai/analyze
```

Environment variables on the backend:

```txt
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=openai/gpt-5.4-mini
```

The mobile app calls this backend through:

```txt
EXPO_PUBLIC_BD_BACKEND_URL=https://your-backend.example.com
```

Request:

```json
{
  "content": "Text, public metadata, comments and collection limits",
  "sourceUrl": "https://x.com/...",
  "platform": "X / Twitter",
  "conversationId": "2048042980078965080",
  "comments": ["Public reply text"],
  "language": "fr"
}
```

Response:

```json
{
  "verdict": "fiable",
  "score": 82,
  "risk_level": "low",
  "reason": "Short human-readable reason",
  "summary": "Short summary",
  "flags": ["non_verifiable"],
  "requires_external_check": true,
  "suggested_checks": ["Find an official source"],
  "confidence": 0.72,
  "model": "openai/gpt-5.4-mini"
}
```
