import React, { useState, useEffect, useRef, useCallback } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://chat.sawyerbobk563.workers.dev'

const MODELS = [
  { id: '@cf/meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', tag: 'Fast' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B', tag: 'Smart' },
  { id: '@cf/mistral/mistral-7b-instruct-v0.1', label: 'Mistral 7B', tag: '' },
  { id: '@cf/google/gemma-7b-it-lora', label: 'Gemma 7B', tag: '' },
  { id: '@cf/qwen/qwen1.5-14b-chat-awq', label: 'Qwen 1.5 14B', tag: '' },
]

const DEFAULT_SETTINGS = {
  model: MODELS[0].id,
  systemPrompt: 'You are a helpful AI assistant.',
  temperature: 0.7,
  maxTokens: 1024,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────

const Icon = {
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Send: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Logout: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  Chat: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Close: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Stop: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  ),
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '2px 0',
    }}>
      <div style={{
        maxWidth: '78%',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}>
        <div style={{
          padding: isUser ? '10px 14px' : '12px 16px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser ? 'var(--text)' : 'var(--bg-3)',
          color: isUser ? 'var(--bg)' : 'var(--text)',
          fontSize: '14px',
          lineHeight: '1.6',
          border: isUser ? 'none' : '1px solid var(--border)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'inherit',
        }}>
          {msg.content}
          {msg.streaming && (
            <span style={{ display: 'inline-block', width: '6px', height: '14px', background: 'var(--text-2)', borderRadius: '1px', marginLeft: '3px', verticalAlign: 'middle', animation: 'blink 0.9s step-end infinite' }} />
          )}
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', padding: '0 4px' }}>
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({ settings, onSave, onClose, username }) {
  const [local, setLocal] = useState(settings)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        width: '100%', maxWidth: '480px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '-0.02em' }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '4px' }}>
            <Icon.Close />
          </button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 12px', background: 'var(--bg-3)', borderRadius: 'var(--radius-sm)' }}>
          Signed in as <strong style={{ color: 'var(--text-2)' }}>{username}</strong>
        </div>

        <Field label="Model">
          <select
            value={local.model}
            onChange={(e) => setLocal(p => ({ ...p, model: e.target.value }))}
            style={selectStyle}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}{m.tag ? ` — ${m.tag}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="System prompt">
          <textarea
            value={local.systemPrompt}
            onChange={(e) => setLocal(p => ({ ...p, systemPrompt: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          />
        </Field>

        <Field label={`Temperature — ${local.temperature}`}>
          <input
            type="range" min="0" max="2" step="0.1"
            value={local.temperature}
            onChange={(e) => setLocal(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
            style={{ width: '100%', accentColor: 'var(--text)' }}
          />
        </Field>

        <Field label={`Max tokens — ${local.maxTokens}`}>
          <input
            type="range" min="256" max="4096" step="256"
            value={local.maxTokens}
            onChange={(e) => setLocal(p => ({ ...p, maxTokens: parseInt(e.target.value) }))}
            style={{ width: '100%', accentColor: 'var(--text)' }}
          />
        </Field>

        <button
          onClick={handleSave}
          style={{ ...btnPrimary, marginTop: '4px' }}
        >
          {saved ? '✓ Saved' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: '500', letterSpacing: '0.02em' }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-3)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text)',
  fontSize: '13px', fontFamily: 'inherit', outline: 'none',
}

const selectStyle = {
  ...inputStyle, cursor: 'pointer', appearance: 'none',
}

const btnPrimary = {
  width: '100%', padding: '10px',
  background: 'var(--text)', color: 'var(--bg)',
  border: 'none', borderRadius: 'var(--radius-sm)',
  fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App({ user, onLogout }) {
  const { token, username } = user

  const [chats, setChats] = useState([]) // [{ id, title, messages, createdAt }]
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const abortRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const activeChat = chats.find(c => c.id === activeChatId) || null
  const messages = activeChat?.messages || []

  // ── Load history + settings from worker ──────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [histRes, settRes] = await Promise.all([
          fetch(`${WORKER_URL}/user/chats`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${WORKER_URL}/user/settings`, { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (histRes.ok) {
          const data = await histRes.json()
          setChats(data.chats || [])
          if (data.chats?.length > 0) setActiveChatId(data.chats[0].id)
        }
        if (settRes.ok) {
          const data = await settRes.json()
          if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings })
        }
      } catch (_) {
        // silently fail — offline or worker not yet configured
      } finally {
        setLoadingHistory(false)
      }
    }
    load()
  }, [token])

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Persist chats to worker ───────────────────────────────────────────────

  const persistChats = useCallback(async (updatedChats) => {
    try {
      await fetch(`${WORKER_URL}/user/chats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chats: updatedChats }),
      })
    } catch (_) {}
  }, [token])

  const persistSettings = useCallback(async (s) => {
    try {
      await fetch(`${WORKER_URL}/user/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings: s }),
      })
    } catch (_) {}
  }, [token])

  // ── Chat management ───────────────────────────────────────────────────────

  const newChat = () => {
    const chat = { id: genId(), title: 'New chat', messages: [], createdAt: new Date().toISOString() }
    const updated = [chat, ...chats]
    setChats(updated)
    setActiveChatId(chat.id)
    persistChats(updated)
  }

  const deleteChat = (id, e) => {
    e.stopPropagation()
    const updated = chats.filter(c => c.id !== id)
    setChats(updated)
    if (activeChatId === id) setActiveChatId(updated[0]?.id || null)
    persistChats(updated)
  }

  const updateChat = useCallback((chatId, updater) => {
    setChats(prev => {
      const updated = prev.map(c => c.id === chatId ? updater(c) : c)
      return updated
    })
  }, [])

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming) return

    let chatId = activeChatId
    let currentChats = chats

    // Create a new chat if none active
    if (!chatId) {
      const chat = { id: genId(), title: text.slice(0, 40), messages: [], createdAt: new Date().toISOString() }
      currentChats = [chat, ...chats]
      setChats(currentChats)
      setActiveChatId(chat.id)
      chatId = chat.id
    }

    const userMsg = { id: genId(), role: 'user', content: text, createdAt: new Date().toISOString() }
    const assistantMsg = { id: genId(), role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true }

    // Add user + placeholder assistant message
    setChats(prev => prev.map(c => c.id === chatId
      ? { ...c, messages: [...c.messages, userMsg, assistantMsg], title: c.messages.length === 0 ? text.slice(0, 40) : c.title }
      : c
    ))
    setInput('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const history = (currentChats.find(c => c.id === chatId)?.messages || [])
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch(`${WORKER_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: settings.model,
          systemPrompt: settings.systemPrompt,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          messages: [...history, { role: 'user', content: text }],
        }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`Worker error: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE lines
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') break
            try {
              const parsed = JSON.parse(raw)
              const delta = parsed.response || parsed.delta || ''
              fullText += delta
              setChats(prev => prev.map(c => c.id === chatId
                ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: fullText } : m) }
                : c
              ))
            } catch (_) {}
          }
        }
      }

      // Finalize — remove streaming flag, persist
      setChats(prev => {
        const updated = prev.map(c => c.id === chatId
          ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, streaming: false } : m) }
          : c
        )
        persistChats(updated)
        return updated
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        setChats(prev => {
          const updated = prev.map(c => c.id === chatId
            ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: m.content || '*(stopped)*', streaming: false } : m) }
            : c
          )
          persistChats(updated)
          return updated
        })
      } else {
        setChats(prev => prev.map(c => c.id === chatId
          ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id
              ? { ...m, content: `Error: ${err.message}`, streaming: false }
              : m) }
          : c
        ))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleSaveSettings = (s) => {
    setSettings(s)
    persistSettings(s)
  }

  const currentModel = MODELS.find(m => m.id === settings.model) || MODELS[0]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .msg-enter { animation: fadeIn 0.2s ease; }
        .sidebar-item:hover .delete-btn { opacity: 1 !important; }
      `}</style>

      <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: sidebarOpen ? '240px' : '0',
          minWidth: sidebarOpen ? '240px' : '0',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          background: 'var(--bg-2)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '16px 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' }}>
            {/* New chat btn */}
            <button
              onClick={newChat}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-4)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: '13px', fontWeight: '500',
                cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Icon.Plus /> New chat
            </button>

            {/* Chat list */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
              {loadingHistory
                ? <p style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 4px' }}>Loading…</p>
                : chats.length === 0
                  ? <p style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 4px' }}>No chats yet.</p>
                  : chats.map(chat => (
                    <div
                      key={chat.id}
                      className="sidebar-item"
                      onClick={() => setActiveChatId(chat.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: chat.id === activeChatId ? 'var(--bg-4)' : 'transparent',
                        border: '1px solid',
                        borderColor: chat.id === activeChatId ? 'var(--border)' : 'transparent',
                        transition: 'all 0.1s',
                        position: 'relative',
                      }}
                    >
                      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}><Icon.Chat /></span>
                      <span style={{
                        fontSize: '13px', color: chat.id === activeChatId ? 'var(--text)' : 'var(--text-2)',
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{chat.title || 'Untitled'}</span>
                      <button
                        className="delete-btn"
                        onClick={(e) => deleteChat(chat.id, e)}
                        style={{
                          opacity: 0, background: 'none', border: 'none',
                          cursor: 'pointer', color: 'var(--text-3)', padding: '2px',
                          flexShrink: 0, transition: 'opacity 0.15s',
                          display: 'flex', alignItems: 'center',
                        }}
                        title="Delete chat"
                      >
                        <Icon.Trash />
                      </button>
                    </div>
                  ))
              }
            </div>

            {/* Bottom user row */}
            <div style={{
              borderTop: '1px solid var(--border)', paddingTop: '12px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--bg-4)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', color: 'var(--text-2)', fontWeight: '600', flexShrink: 0,
              }}>
                {username[0].toUpperCase()}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</span>
              <button
                onClick={() => setShowSettings(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px', display: 'flex' }}
                title="Settings"
              >
                <Icon.Settings />
              </button>
              <button
                onClick={onLogout}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px', display: 'flex' }}
                title="Sign out"
              >
                <Icon.Logout />
              </button>
            </div>
          </div>
        </div>

        {/* ── Main chat area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

          {/* Top bar */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '4px', display: 'flex', borderRadius: '6px' }}
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            <span style={{ fontSize: '14px', color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeChat?.title || 'AI Chat'}
            </span>

            {/* Model selector */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select
                value={settings.model}
                onChange={(e) => {
                  const s = { ...settings, model: e.target.value }
                  setSettings(s)
                  persistSettings(s)
                }}
                style={{
                  appearance: 'none', background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', fontSize: '12px',
                  padding: '5px 28px 5px 10px', cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                }}
              >
                {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <span style={{ position: 'absolute', right: '8px', pointerEvents: 'none', color: 'var(--text-3)' }}>
                <Icon.ChevronDown />
              </span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.4 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p style={{ fontSize: '14px', color: 'var(--text-2)' }}>Start a conversation</p>
              </div>
            ) : (
              messages.map(msg => <Message key={msg.id} msg={msg} />)
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: '12px 16px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-end',
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '8px 8px 8px 14px',
              transition: 'border-color 0.15s',
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message…"
                rows={1}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: 'var(--text)', fontSize: '14px', fontFamily: 'inherit',
                  resize: 'none', lineHeight: '1.5', padding: '4px 0',
                  maxHeight: '160px', overflowY: 'auto',
                }}
              />
              <button
                onClick={streaming ? stopStreaming : sendMessage}
                disabled={!streaming && !input.trim()}
                style={{
                  width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                  background: streaming ? 'var(--bg-4)' : (input.trim() ? 'var(--text)' : 'var(--bg-4)'),
                  border: streaming ? '1px solid var(--border)' : 'none',
                  color: streaming ? 'var(--text)' : (input.trim() ? 'var(--bg)' : 'var(--text-3)'),
                  cursor: (streaming || input.trim()) ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                {streaming ? <Icon.Stop /> : <Icon.Send />}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'center' }}>
              {currentModel.label} · Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          username={username}
        />
      )}
    </>
  )
}
