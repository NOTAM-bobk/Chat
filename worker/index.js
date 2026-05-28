/**
 * Cloudflare Worker — AI Chat Backend
 *
 * KV namespace binding: CHAT_KV2  (set in wrangler.toml)
 * AI binding:           AI       (set in wrangler.toml)
 * Secret:               JWT_SECRET (set via `wrangler secret put JWT_SECRET`)
 *
 * KV key schema:
 *   user:{username}          → { passwordHash, createdAt }
 *   token:{token}            → { username, createdAt }
 *   chats:{username}         → { chats: [...] }
 *   settings:{username}      → { settings: { ... } }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function genToken() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function err(message, status = 400) {
  return json({ error: message }, status)
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  const raw = await env.CHAT_KV2.get(`token:${token}`)
  if (!raw) return null
  return JSON.parse(raw) // { username, createdAt }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleRegister(request, env) {
  const { username, password } = await request.json()

  if (!username || !password) return err('Username and password required.')
  if (username.length < 3) return err('Username must be at least 3 characters.')
  if (password.length < 6) return err('Password must be at least 6 characters.')
  if (!/^[a-z0-9_]+$/.test(username)) return err('Username can only contain letters, numbers, and underscores.')

  const existing = await env.CHAT_KV2.get(`user:${username}`)
  if (existing) return err('Username already taken.', 409)

  const passwordHash = await hashPassword(password)
  const token = genToken()
  const now = new Date().toISOString()

  await Promise.all([
    env.CHAT_KV2.put(`user:${username}`, JSON.stringify({ passwordHash, createdAt: now })),
    env.CHAT_KV2.put(`token:${token}`, JSON.stringify({ username, createdAt: now })),
  ])

  return json({ token, username })
}

async function handleLogin(request, env) {
  const { username, password } = await request.json()
  if (!username || !password) return err('Username and password required.')

  const raw = await env.CHAT_KV2.get(`user:${username}`)
  if (!raw) return err('Invalid username or password.', 401)

  const { passwordHash } = JSON.parse(raw)
  const hash = await hashPassword(password)
  if (hash !== passwordHash) return err('Invalid username or password.', 401)

  const token = genToken()
  await env.CHAT_KV2.put(`token:${token}`, JSON.stringify({ username, createdAt: new Date().toISOString() }))

  return json({ token, username })
}

async function handleGetChats(request, env, session) {
  const raw = await env.CHAT_KV2.get(`chats:${session.username}`)
  const data = raw ? JSON.parse(raw) : { chats: [] }
  return json(data)
}

async function handlePutChats(request, env, session) {
  const body = await request.json()
  await env.CHAT_KV2.put(`chats:${session.username}`, JSON.stringify({ chats: body.chats || [] }))
  return json({ ok: true })
}

async function handleGetSettings(request, env, session) {
  const raw = await env.CHAT_KV2.get(`settings:${session.username}`)
  const data = raw ? JSON.parse(raw) : { settings: null }
  return json(data)
}

async function handlePutSettings(request, env, session) {
  const body = await request.json()
  await env.CHAT_KV2.put(`settings:${session.username}`, JSON.stringify({ settings: body.settings }))
  return json({ ok: true })
}

async function handleAiChat(request, env, session) {
  const { model, systemPrompt, messages, temperature, maxTokens } = await request.json()

  if (!model) return err('model is required.')
  if (!messages || !Array.isArray(messages) || messages.length === 0) return err('messages array is required.')

  const builtMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ]

  // Run AI inference — Cloudflare AI binding streams by default with { stream: true }
  const response = await env.AI.run(model, {
    messages: builtMessages,
    stream: true,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 1024,
  })

  // Pass the SSE stream directly back to the client
  return new Response(response, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname

    // Public routes (no auth needed)
    if (path === '/auth/register' && request.method === 'POST') return handleRegister(request, env)
    if (path === '/auth/login' && request.method === 'POST') return handleLogin(request, env)

    // Protected routes
    const session = await authenticate(request, env)
    if (!session) return err('Unauthorized.', 401)

    if (path === '/user/chats') {
      if (request.method === 'GET') return handleGetChats(request, env, session)
      if (request.method === 'PUT') return handlePutChats(request, env, session)
    }
    if (path === '/user/settings') {
      if (request.method === 'GET') return handleGetSettings(request, env, session)
      if (request.method === 'PUT') return handlePutSettings(request, env, session)
    }
    if (path === '/ai/chat' && request.method === 'POST') return handleAiChat(request, env, session)

    return err('Not found.', 404)
  },
}
