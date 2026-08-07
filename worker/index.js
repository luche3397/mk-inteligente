const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARACTERS = 40_000;
const MAX_ATTACHMENTS = 2;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 12;
const rateLimitBuckets = new Map();

const jsonResponse = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });

const decodeJwtPayload = (token) => {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
};

const getSupabaseIssuer = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload?.iss || !payload?.sub || (payload.exp && payload.exp * 1000 <= Date.now())) return null;

  try {
    const issuer = new URL(payload.iss);
    const isSupabaseHost = issuer.protocol === 'https:' && issuer.hostname.endsWith('.supabase.co');
    const isAuthIssuer = issuer.pathname.replace(/\/$/, '').endsWith('/auth/v1');
    return isSupabaseHost && isAuthIssuer ? { issuer, userId: payload.sub } : null;
  } catch {
    return null;
  }
};

const verifySupabaseSession = async (request) => {
  const authorization = request.headers.get('Authorization') ?? '';
  const anonKey = request.headers.get('X-Supabase-Anon-Key') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const identity = getSupabaseIssuer(token);
  if (!identity || !anonKey || anonKey.length > 4096) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(new URL('user', `${identity.issuer.toString().replace(/\/$/, '')}/`), {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id === identity.userId ? user : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const consumeRateLimit = (userId) => {
  const now = Date.now();
  const current = rateLimitBuckets.get(userId);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) return false;
  current.count += 1;
  return true;
};

const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  const normalized = [];
  let totalCharacters = 0;

  for (const item of history.slice(-MAX_HISTORY_MESSAGES)) {
    const role = item?.role === 'assistant' || item?.role === 'model' ? 'model' : item?.role === 'user' ? 'user' : null;
    const text = typeof item?.content === 'string' ? item.content.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
    if (!role || !text || totalCharacters + text.length > MAX_HISTORY_CHARACTERS) continue;
    normalized.push({ role, parts: [{ text }] });
    totalCharacters += text.length;
  }

  while (normalized[0]?.role === 'model') normalized.shift();
  return normalized;
};

const normalizeAttachments = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS) return null;
  const normalized = [];
  let totalBytes = 0;

  for (const attachment of attachments) {
    if (attachment?.type !== 'image' || !['image/png', 'image/jpeg', 'image/webp'].includes(attachment.mimeType)) return null;
    if (typeof attachment.data !== 'string' || !/^[a-zA-Z0-9+/]+={0,2}$/.test(attachment.data)) return null;
    const estimatedBytes = Math.floor((attachment.data.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) return null;
    totalBytes += estimatedBytes;
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) return null;
    normalized.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
  }

  return normalized;
};

const handleAiRequest = async (request, env) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Metodo nao permitido.' }, 405);

  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Requisicao muito grande.' }, 413);

  const user = await verifySupabaseSession(request);
  if (!user) return jsonResponse({ error: 'Sessao invalida ou expirada.' }, 401);
  if (!env.GEMINI_API_KEY) return jsonResponse({ error: 'Assistente IA nao configurado.' }, 503);
  if (!consumeRateLimit(user.id)) return jsonResponse({ error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' }, 429);

  let rawBody;
  try {
    rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Requisicao muito grande.' }, 413);
  } catch {
    return jsonResponse({ error: 'Nao foi possivel ler a requisicao.' }, 400);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'JSON invalido.' }, 400);
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (message.length > MAX_MESSAGE_LENGTH) return jsonResponse({ error: 'Mensagem muito longa.' }, 400);
  const attachments = normalizeAttachments(payload.attachments ?? []);
  if (!attachments) return jsonResponse({ error: 'Anexo invalido ou acima do limite.' }, 400);
  if (!message && !attachments.length) return jsonResponse({ error: 'Envie uma mensagem ou imagem.' }, 400);

  const contents = normalizeHistory(payload.history);
  contents.push({
    role: 'user',
    parts: [...attachments, { text: message || 'Analise a imagem enviada.' }],
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'Voce e um assistente de produtividade. Responda no idioma do usuario. Use somente o contexto enviado explicitamente nesta conversa e nunca presuma acesso ao workspace.' }],
        },
        contents,
        generationConfig: {
          maxOutputTokens: 4096,
        },
      }),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.error?.message;
      return jsonResponse({ error: detail ? `Gemini: ${detail}` : 'Falha ao consultar o Gemini.' }, response.status >= 500 ? 502 : 400);
    }

    const answer = result?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!answer) return jsonResponse({ error: 'O Gemini nao retornou uma resposta de texto.' }, 502);
    return jsonResponse({ answer, model: GEMINI_MODEL });
  } catch (error) {
    return jsonResponse({ error: error?.name === 'AbortError' ? 'A resposta da IA excedeu o tempo limite.' : 'Falha temporaria ao consultar a IA.' }, 504);
  } finally {
    clearTimeout(timeout);
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai') return handleAiRequest(request, env);
    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'Endpoint nao encontrado.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
