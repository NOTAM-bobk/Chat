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

// Rate limit: max 10 messages per minute per user (client-side guard)
const RATE_LIMIT = { max: 10, windowMs: 60000 }

function genId() { return Math.random().toString(36).slice(2, 10) }
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Send: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  ),
  Settings: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Logout: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  Chat: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Close: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Stop: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="3"/>
    </svg>
  ),
  Grid: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="5.5" height="5.5" rx="1"/>
      <rect x="8.5" y="0" width="5.5" height="5.5" rx="1"/>
      <rect x="0" y="8.5" width="5.5" height="5.5" rx="1"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1"/>
    </svg>
  ),
  Pencil: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Copy: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  Sound: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  ),
  Retry: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    </svg>
  ),
  Attach: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  ),
  Globe: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  Code: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  Doc: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Image: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
}

// ── Message component ─────────────────────────────────────────────────────────
function Message({ msg, onRetry, onCopy, onSpeak, speakingId }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)
  const isSpeaking = speakingId === msg.id

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
    onCopy && onCopy(msg)
  }

  return (
    <div className="msg-enter" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: '4px',
      padding: '10px 0',
    }}>
      {/* Label row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: '4px',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        <span style={{
          fontFamily: 'Roboto Mono, monospace', fontSize: '9px', fontWeight: '600',
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: isUser ? 'rgba(120,180,255,0.6)' : 'rgba(255,255,255,0.28)',
        }}>
          {isUser ? 'You' : 'AI'}
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.18)', fontFamily: 'Roboto Mono, monospace' }}>
          {formatTime(msg.createdAt)}
        </span>
      </div>

      {/* Content */}
      {isUser ? (
        // User — bubble
        <div style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: '18px 18px 4px 18px',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(99,102,241,0.18) 100%)',
          border: '1px solid rgba(99,130,255,0.22)',
          backdropFilter: 'blur(10px)',
        }}>
          <p style={{
            fontSize: '14px', lineHeight: '1.75',
            color: 'rgba(220,235,255,0.9)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', margin: 0, fontWeight: '400',
          }}>
            {msg.content}
          </p>
        </div>
      ) : (
        // AI — flat text on background
        <div style={{ maxWidth: '88%' }}>
          <p style={{
            fontSize: '14px', lineHeight: '1.8',
            color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', margin: 0, fontWeight: '400',
          }}>
            {msg.content}
            {msg.streaming && (
              <span style={{
                display: 'inline-block', width: '2px', height: '14px',
                background: 'rgba(255,255,255,0.45)', borderRadius: '1px',
                marginLeft: '3px', verticalAlign: 'middle',
                animation: 'blink 0.9s step-end infinite',
              }} />
            )}
          </p>

          {/* AI action tools */}
          {!msg.streaming && (
            <div style={{
              display: 'flex', gap: '2px', marginTop: '10px', alignItems: 'center',
            }}>
              {[
                { label: copied ? 'Copied' : 'Copy', icon: <Icon.Copy />, action: handleCopy, active: copied },
                { label: isSpeaking ? 'Stop' : 'Sound', icon: <Icon.Sound />, action: () => onSpeak(msg), active: isSpeaking },
                { label: 'Retry', icon: <Icon.Retry />, action: () => onRetry(msg) },
              ].map(({ label, icon, action, active }) => (
                <button key={label} onClick={action} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 9px', borderRadius: '8px',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: '1px solid', borderColor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.28)',
                  fontSize: '11px', fontFamily: 'Roboto Mono, monospace',
                  letterSpacing: '0.05em', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.28)'; e.currentTarget.style.borderColor = 'transparent' } }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tools popup ───────────────────────────────────────────────────────────────
function ToolsPopup({ onSelect, onClose, anchorRef }) {
  const tools = [
    { id: 'web', label: 'Web Search', icon: <Icon.Globe />, desc: 'Search the internet' },
    { id: 'code', label: 'Code Interpreter', icon: <Icon.Code />, desc: 'Run & analyze code' },
    { id: 'docs', label: 'Docs', icon: <Icon.Doc />, desc: 'Analyze documents' },
    { id: 'image', label: 'Image', icon: <Icon.Image />, desc: 'Attach an image' },
  ]
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 10px)', left: 0,
      background: 'rgba(12,12,12,0.95)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '14px', padding: '6px', minWidth: '200px',
      backdropFilter: 'blur(20px)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
      zIndex: 50,
    }}>
      {tools.map(t => (
        <button key={t.id} onClick={() => { onSelect(t.id); onClose() }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            width: '100%', padding: '9px 10px', borderRadius: '9px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.65)', textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{t.icon}</span>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>{t.label}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Roboto Mono, monospace' }}>{t.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px', color: 'rgba(255,255,255,0.85)',
  fontSize: '13px', fontFamily: 'inherit', outline: 'none',
}
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'none' }

function SettingsPanel({ settings, onSave, onClose, username }) {
  const [local, setLocal] = useState(settings)
  const [saved, setSaved] = useState(false)
  const handleSave = () => { onSave(local); setSaved(true); setTimeout(() => setSaved(false), 1500) }
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(14px)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px', width: '100%', maxWidth: '460px',
        padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px',
        boxShadow: '0 30px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Roboto Mono, monospace', fontSize: '11px', fontWeight: '600', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px', display: 'flex' }}><Icon.Close /></button>
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          Signed in as <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{username}</strong>
        </div>
        <SField label="Model">
          <select value={local.model} onChange={e => setLocal(p => ({ ...p, model: e.target.value }))} style={selectStyle}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}{m.tag ? ` — ${m.tag}` : ''}</option>)}
          </select>
        </SField>
        <SField label="System Prompt">
          <textarea value={local.systemPrompt} onChange={e => setLocal(p => ({ ...p, systemPrompt: e.target.value }))} rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Roboto Mono, monospace', fontSize: '11px' }} />
        </SField>
        <SField label={`Temperature — ${local.temperature}`}>
          <input type="range" min="0" max="2" step="0.1" value={local.temperature}
            onChange={e => setLocal(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
            style={{ width: '100%', accentColor: 'white' }} />
        </SField>
        <SField label={`Max Tokens — ${local.maxTokens}`}>
          <input type="range" min="256" max="4096" step="256" value={local.maxTokens}
            onChange={e => setLocal(p => ({ ...p, maxTokens: parseInt(e.target.value) }))}
            style={{ width: '100%', accentColor: 'white' }} />
        </SField>
        <button onClick={handleSave} style={{
          padding: '11px', background: 'white', color: 'black', border: 'none',
          borderRadius: '12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
          fontFamily: 'Roboto Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function SField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontFamily: 'Roboto Mono, monospace', fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontWeight: '500', letterSpacing: '0.2em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App({ user, onLogout }) {
  const { token, username } = user

  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navShrunk, setNavShrunk] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [chatMenuOpen, setChatMenuOpen] = useState(null)
  const [renamingChatId, setRenamingChatId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [showToolsPopup, setShowToolsPopup] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const [inputFocused, setInputFocused] = useState(false)
  const [speakingId, setSpeakingId] = useState(null)
  // Rate limit tracking
  const msgTimestamps = useRef([])
  const [rateLimited, setRateLimited] = useState(false)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)

  const abortRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const plusBtnRef = useRef(null)
  const speechRef = useRef(null)

  const activeChat = chats.find(c => c.id === activeChatId) || null
  const messages = activeChat?.messages || []

  // ── Rate limit countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (!rateLimited) return
    const interval = setInterval(() => {
      const now = Date.now()
      const recent = msgTimestamps.current.filter(t => now - t < RATE_LIMIT.windowMs)
      msgTimestamps.current = recent
      if (recent.length < RATE_LIMIT.max) {
        setRateLimited(false)
        setRateLimitCountdown(0)
      } else {
        const oldest = recent[0]
        const remaining = Math.ceil((RATE_LIMIT.windowMs - (now - oldest)) / 1000)
        setRateLimitCountdown(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [rateLimited])

  // ── Load history + settings ───────────────────────────────────────────────
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
      } catch (_) {}
      finally { setLoadingHistory(false) }
    }
    load()
  }, [token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close tools popup on outside click
  useEffect(() => {
    if (!showToolsPopup) return
    const handler = (e) => {
      if (plusBtnRef.current && !plusBtnRef.current.contains(e.target)) setShowToolsPopup(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showToolsPopup])

  // ── Persist ───────────────────────────────────────────────────────────────
  const persistChats = useCallback(async (updated) => {
    try {
      await fetch(`${WORKER_URL}/user/chats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chats: updated }),
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

  // ── Auto-name ─────────────────────────────────────────────────────────────
  const autoNameChat = useCallback(async (chatId, firstUserMsg, firstAiMsg) => {
    try {
      const res = await fetch(`${WORKER_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: '@cf/meta/llama-3.1-8b-instruct',
          systemPrompt: 'You generate ultra-short chat titles. Reply with ONLY 2-5 words, no punctuation, no quotes.',
          messages: [{ role: 'user', content: `Give a 2-5 word title for a chat that started with:\nUser: ${firstUserMsg}\nAI: ${firstAiMsg.slice(0, 120)}` }],
          temperature: 0.5, maxTokens: 20,
        }),
      })
      if (!res.ok) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let title = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') break
            try { title += JSON.parse(raw).response || JSON.parse(raw).delta || '' } catch (_) {}
          }
        }
      }
      const cleanTitle = title.trim().replace(/^["']|["']$/g, '').slice(0, 50)
      if (!cleanTitle) return
      setChats(prev => {
        const updated = prev.map(c => c.id === chatId ? { ...c, title: cleanTitle } : c)
        persistChats(updated)
        return updated
      })
    } catch (_) {}
  }, [token, persistChats])

  // ── Chat management ───────────────────────────────────────────────────────
  const newChat = () => {
    const chat = { id: genId(), title: 'New chat', messages: [], createdAt: new Date().toISOString() }
    const updated = [chat, ...chats]
    setChats(updated)
    setActiveChatId(chat.id)
    setSidebarOpen(false)
    persistChats(updated)
  }

  const deleteChat = (id) => {
    const updated = chats.filter(c => c.id !== id)
    setChats(updated)
    if (activeChatId === id) setActiveChatId(updated[0]?.id || null)
    persistChats(updated)
  }

  const finishRename = (chatId) => {
    if (!renameValue.trim()) { setRenamingChatId(null); return }
    setChats(prev => {
      const updated = prev.map(c => c.id === chatId ? { ...c, title: renameValue.trim() } : c)
      persistChats(updated)
      return updated
    })
    setRenamingChatId(null)
  }

  // ── TTS ───────────────────────────────────────────────────────────────────
  const handleSpeak = (msg) => {
    if (speakingId === msg.id) {
      window.speechSynthesis.cancel()
      setSpeakingId(null)
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(msg.content)
    utter.onend = () => setSpeakingId(null)
    utter.onerror = () => setSpeakingId(null)
    speechRef.current = utter
    window.speechSynthesis.speak(utter)
    setSpeakingId(msg.id)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (overrideText) => {
    const text = (overrideText || input).trim()
    if (!text || streaming) return

    // Client-side rate limit
    const now = Date.now()
    const recent = msgTimestamps.current.filter(t => now - t < RATE_LIMIT.windowMs)
    if (recent.length >= RATE_LIMIT.max) {
      msgTimestamps.current = recent
      setRateLimited(true)
      return
    }
    msgTimestamps.current = [...recent, now]

    let chatId = activeChatId
    let currentChats = chats
    if (!chatId) {
      const chat = { id: genId(), title: 'New chat', messages: [], createdAt: new Date().toISOString() }
      currentChats = [chat, ...chats]
      setChats(currentChats)
      setActiveChatId(chat.id)
      chatId = chat.id
    }

    const isFirstMessage = (currentChats.find(c => c.id === chatId)?.messages || []).length === 0
    const userMsg = { id: genId(), role: 'user', content: text, createdAt: new Date().toISOString() }
    const assistantMsg = { id: genId(), role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true }

    setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, userMsg, assistantMsg] } : c))
    setInput('')
    setStreaming(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

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
          model: settings.model, systemPrompt: settings.systemPrompt,
          temperature: settings.temperature, maxTokens: settings.maxTokens,
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
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') break
            try {
              const delta = JSON.parse(raw).response || JSON.parse(raw).delta || ''
              fullText += delta
              setChats(prev => prev.map(c => c.id === chatId
                ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: fullText } : m) }
                : c
              ))
            } catch (_) {}
          }
        }
      }

      setChats(prev => {
        const updated = prev.map(c => c.id === chatId
          ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, streaming: false } : m) }
          : c
        )
        persistChats(updated)
        return updated
      })
      if (isFirstMessage && fullText.trim()) autoNameChat(chatId, text, fullText)

    } catch (err) {
      if (err.name === 'AbortError') {
        setChats(prev => {
          const updated = prev.map(c => c.id === chatId
            ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: m.content || '(stopped)', streaming: false } : m) }
            : c
          )
          persistChats(updated)
          return updated
        })
      } else {
        setChats(prev => prev.map(c => c.id === chatId
          ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: `Error: ${err.message}`, streaming: false } : m) }
          : c
        ))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stopStreaming = () => abortRef.current?.abort()

  const handleRetry = (msg) => {
    // Find the user message before this assistant message
    const idx = messages.findIndex(m => m.id === msg.id)
    if (idx > 0 && messages[idx - 1].role === 'user') {
      const userText = messages[idx - 1].content
      // Remove the assistant message and resend
      setChats(prev => prev.map(c => c.id === activeChatId
        ? { ...c, messages: c.messages.filter(m => m.id !== msg.id) }
        : c
      ))
      setTimeout(() => sendMessage(userText), 50)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleSaveSettings = (s) => { setSettings(s); persistSettings(s) }

  const currentModel = MODELS.find(m => m.id === settings.model) || MODELS[0]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes liquidShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulseGlow {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
          50%      { box-shadow: 0 0 0 4px rgba(255,255,255,0.06); }
        }
        .msg-enter { animation: fadeIn 0.22s ease; }

        .app-root {
          height: 100%;
          background-color: #050505;
          background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm1 1h38v38H1V1z' fill='%23ffffff' fill-opacity='0.025' fill-rule='evenodd'/%3E%3C/svg%3E");
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          font-family: 'Inter', -apple-system, sans-serif;
        }

        /* Ambient glows */
        .ambient-top {
          position: fixed; top: -30%; left: 50%; transform: translateX(-50%);
          width: 140vw; height: 90vw; max-height: 700px;
          border-radius: 100%; background: rgba(255,255,255,0.065);
          filter: blur(120px); pointer-events: none; z-index: 0;
        }
        .ambient-top-core {
          position: fixed; top: -15%; left: 50%; transform: translateX(-50%);
          width: 60vw; height: 40vw; max-height: 350px;
          border-radius: 100%; background: rgba(255,255,255,0.09);
          filter: blur(70px); pointer-events: none; z-index: 0;
        }
        .ambient-input {
          position: fixed; bottom: -60px; left: 50%; transform: translateX(-50%);
          width: 80vw; max-width: 700px; height: 220px;
          border-radius: 100%; background: rgba(255,255,255,0.05);
          filter: blur(60px); pointer-events: none; z-index: 0;
        }

        /* Navbar */
        #tux-nav {
          transition: max-width 0.6s cubic-bezier(0.22,1,0.36,1), padding 0.6s cubic-bezier(0.22,1,0.36,1), background-color 0.4s ease;
          max-width: 520px; width: 90%;
        }
        #tux-nav.shrunk {
          max-width: 64px !important; padding-left: 0 !important; padding-right: 0 !important;
          justify-content: center !important; background-color: rgba(255,255,255,0.03) !important;
          border-color: rgba(255,255,255,0.15) !important;
        }
        .nav-btn {
          transition: all 0.5s cubic-bezier(0.22,1,0.36,1);
          max-width: 140px; overflow: hidden; white-space: nowrap; opacity: 1;
        }
        .nav-btn.shrunk {
          max-width: 0 !important; padding-left: 0 !important; padding-right: 0 !important;
          margin-left: 0 !important; margin-right: 0 !important;
          opacity: 0 !important; border-width: 0 !important; pointer-events: none;
        }

        /* Sidebar */
        .sidebar-overlay {
          position: fixed; inset: 0; z-index: 80;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
          opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }
        .sidebar-overlay.open { opacity: 1; pointer-events: all; }
        .sidebar-panel {
          position: fixed; top: 0; left: 0; bottom: 0; width: 260px; z-index: 90;
          background: #0a0a0a; border-right: 1px solid rgba(255,255,255,0.07);
          display: flex; flex-direction: column;
          transform: translateX(-100%); transition: transform 0.35s cubic-bezier(0.22,1,0.36,1);
        }
        .sidebar-panel.open { transform: translateX(0); }
        .chat-item:hover .del-btn { opacity: 1 !important; }
        .chat-item:hover .menu-btn { opacity: 1 !important; }
        .chat-menu-item {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 8px 10px; border-radius: 8px;
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.6); font-size: 12px; font-family: inherit;
          transition: background 0.15s; text-align: left;
        }
        .chat-menu-item:hover { background: rgba(255,255,255,0.07); }
        .chat-menu-item.danger { color: rgba(255,100,100,0.7); }
        .chat-menu-item.danger:hover { background: rgba(255,80,80,0.08); }

        /* Messages scroll — goes under navbar via overflow */
        .msg-scroll { }
        .msg-scroll::-webkit-scrollbar { width: 3px; }
        .msg-scroll::-webkit-scrollbar-track { background: transparent; }
        .msg-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

        /* Liquid metal send button */
        .liquid-btn {
          background: linear-gradient(135deg, #d4d4d4 0%, #ffffff 25%, #a8a8a8 50%, #e8e8e8 75%, #c0c0c0 100%);
          background-size: 300% 300%;
          animation: liquidShift 3s ease infinite;
          box-shadow: 0 2px 12px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.15);
        }
        .liquid-btn:hover {
          box-shadow: 0 4px 20px rgba(255,255,255,0.35), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.2);
          filter: brightness(1.05);
        }
        .liquid-btn-inactive {
          background: rgba(255,255,255,0.07);
          box-shadow: none;
        }

        /* Input glow ring */
        .input-ring {
          border-radius: 24px;
          transition: box-shadow 0.3s ease, border-color 0.3s ease;
        }
        .input-ring.focused {
          box-shadow: 0 0 0 3px rgba(255,255,255,0.06), 0 0 20px rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.18) !important;
        }

        /* Active tool pill */
        .tool-pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 6px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
          font-size: 11px; color: rgba(255,255,255,0.6);
          font-family: 'Roboto Mono', monospace;
        }
      `}</style>

      <div className="ambient-top" />
      <div className="ambient-top-core" />
      <div className="ambient-input" />

      <div className="app-root">

        {/* ── Floating Navbar ── */}
        <div style={{
          position: 'fixed', top: '20px', left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 100, pointerEvents: 'none',
        }}>
          <nav id="tux-nav"
            style={{
              pointerEvents: 'all', height: '52px',
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px', padding: '0 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            }}
            className={navShrunk ? 'shrunk' : ''}
          >
            <button className={`nav-btn${navShrunk ? ' shrunk' : ''}`} onClick={() => setSidebarOpen(true)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 14px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer', color: 'rgba(245,245,245,0.9)',
            }}>
              <span style={{ fontFamily: 'Roboto Mono, monospace', fontSize: '10px', fontWeight: '600', letterSpacing: '0.2em' }}>CHAT</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className={`nav-btn${navShrunk ? ' shrunk' : ''}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer', color: 'rgba(224,224,224,0.5)',
              }}>
                <span style={{ fontFamily: 'Roboto Mono, monospace', fontSize: '10px', fontWeight: '600', letterSpacing: '0.2em' }}>AGENT</span>
              </button>
              <button onClick={() => setNavShrunk(p => !p)} style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer', color: 'rgba(200,200,200,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ display: 'flex', transform: navShrunk ? 'rotate(90deg) scale(0.85)' : 'rotate(0deg) scale(1)', transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1)' }}>
                  <Icon.Grid />
                </span>
              </button>
            </div>
          </nav>
        </div>

        {/* ── Sidebar ── */}
        <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <div className={`sidebar-panel${sidebarOpen ? ' open' : ''}`}>
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'Roboto Mono, monospace', fontSize: '10px', fontWeight: '600', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Chats</span>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: '4px' }}><Icon.Close /></button>
            </div>
            <button onClick={newChat} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: '8px',
            }}>
              <Icon.Plus /> New chat
            </button>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {loadingHistory
                ? <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', padding: '8px 4px', fontFamily: 'Roboto Mono, monospace' }}>Loading…</p>
                : chats.length === 0
                  ? <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', padding: '8px 4px' }}>No chats yet.</p>
                  : chats.map(chat => (
                    <div key={chat.id} className="chat-item" style={{ position: 'relative' }}>
                      {renamingChatId === chat.id ? (
                        <input
                          autoFocus value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => finishRename(chat.id)}
                          onKeyDown={e => { if (e.key === 'Enter') finishRename(chat.id); if (e.key === 'Escape') setRenamingChatId(null) }}
                          style={{ ...inputStyle, fontSize: '13px', padding: '7px 10px', borderRadius: '9px', width: '100%' }}
                        />
                      ) : (
                        <>
                          <div onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false) }} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px',
                            borderRadius: '10px', cursor: 'pointer',
                            background: chat.id === activeChatId ? 'rgba(255,255,255,0.07)' : 'transparent',
                            border: '1px solid', borderColor: chat.id === activeChatId ? 'rgba(255,255,255,0.1)' : 'transparent',
                          }}>
                            <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}><Icon.Chat /></span>
                            <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: chat.id === activeChatId ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)', fontWeight: '300' }}>
                              {chat.title || 'Untitled'}
                            </span>
                            <button className="menu-btn" onClick={e => { e.stopPropagation(); setChatMenuOpen(chatMenuOpen === chat.id ? null : chat.id) }} style={{ opacity: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px', display: 'flex', flexShrink: 0, transition: 'opacity 0.15s' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                            </button>
                          </div>
                          {chatMenuOpen === chat.id && (
                            <div style={{ position: 'absolute', right: '4px', top: '100%', zIndex: 10, background: 'rgba(14,14,14,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '6px', minWidth: '140px', backdropFilter: 'blur(20px)', boxShadow: '0 12px 30px rgba(0,0,0,0.6)' }}>
                              <button className="chat-menu-item" onClick={() => { setRenamingChatId(chat.id); setRenameValue(chat.title || ''); setChatMenuOpen(null) }}>
                                <Icon.Pencil /> Rename
                              </button>
                              <button className="chat-menu-item danger" onClick={() => { deleteChat(chat.id); setChatMenuOpen(null) }}>
                                <Icon.Trash /> Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))
              }
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontFamily: 'Roboto Mono, monospace' }}>
                {username[0].toUpperCase()}
              </div>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '300' }}>{username}</span>
              <button onClick={() => { setShowSettings(true); setSidebarOpen(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: '4px', display: 'flex' }}><Icon.Settings /></button>
              <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: '4px', display: 'flex' }}><Icon.Logout /></button>
            </div>
          </div>
        </div>

        {/* ── Main chat area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

          {/* Messages — scroll under the navbar with top padding, blurred by navbar backdrop */}
          <div className="msg-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
            {/* Padding so first message starts below navbar */}
            <div style={{ height: '100px' }} />

            {/* Model selector */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select value={settings.model} onChange={e => { const s = { ...settings, model: e.target.value }; setSettings(s); persistSettings(s) }}
                  style={{ appearance: 'none', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'rgba(255,255,255,0.32)', fontSize: '11px', padding: '5px 24px 5px 10px', cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', outline: 'none', letterSpacing: '0.05em' }}>
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <span style={{ position: 'absolute', right: '7px', pointerEvents: 'none', color: 'rgba(255,255,255,0.25)' }}><Icon.ChevronDown /></span>
              </div>
            </div>

            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              {messages.length === 0 ? (
                <div style={{ paddingTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', opacity: 0.2 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'white' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontFamily: 'Roboto Mono, monospace', letterSpacing: '0.12em' }}>START A CONVERSATION</p>
                </div>
              ) : (
                messages.map(msg => (
                  <Message key={msg.id} msg={msg}
                    onRetry={handleRetry} onSpeak={handleSpeak} speakingId={speakingId}
                  />
                ))
              )}
              <div ref={bottomRef} style={{ height: '16px' }} />
            </div>
          </div>

          {/* ── Input area ── */}
          <div style={{ padding: '10px 20px 20px', flexShrink: 0, position: 'relative', zIndex: 2 }}>
            {/* Gradient strip */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(120,140,255,0.5) 30%, rgba(180,130,255,0.6) 60%, rgba(100,180,255,0.4) 85%, transparent 100%)',
            }} />

            <div style={{ maxWidth: '720px', margin: '0 auto' }}>

              {/* Rate limit warning */}
              {rateLimited && (
                <div style={{ textAlign: 'center', marginBottom: '8px', fontFamily: 'Roboto Mono, monospace', fontSize: '11px', color: 'rgba(255,160,80,0.8)', letterSpacing: '0.06em' }}>
                  Rate limit reached — wait {rateLimitCountdown}s
                </div>
              )}

              {/* Active tool pills */}
              {activeTools.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {activeTools.map(t => (
                    <span key={t} className="tool-pill">
                      {t}
                      <button onClick={() => setActiveTools(p => p.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: '0', marginLeft: '2px', display: 'flex', lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Input bar */}
              <div ref={plusBtnRef} style={{ position: 'relative' }}>
                {showToolsPopup && (
                  <ToolsPopup
                    onSelect={id => {
                      if (id === 'image') { fileInputRef.current?.click(); return }
                      setActiveTools(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
                    }}
                    onClose={() => setShowToolsPopup(false)}
                  />
                )}

                <div
                  className={`input-ring${inputFocused ? ' focused' : ''}`}
                  style={{
                    display: 'flex', gap: '8px', alignItems: 'flex-end',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '8px 8px 8px 6px',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  {/* Plus button */}
                  <button
                    onClick={() => setShowToolsPopup(p => !p)}
                    style={{
                      width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                      background: showToolsPopup ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', alignSelf: 'flex-end', marginBottom: '1px',
                    }}
                    title="Attach / Tools"
                  >
                    <Icon.Plus />
                  </button>

                  {/* Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => {
                      setInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    placeholder="Message…"
                    rows={1}
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      color: 'rgba(255,255,255,0.88)', fontSize: '14px', fontFamily: 'inherit',
                      resize: 'none', lineHeight: '1.6', padding: '6px 0',
                      maxHeight: '160px', overflowY: 'auto',
                    }}
                  />

                  {/* Send / Stop button — liquid metal */}
                  <button
                    onClick={streaming ? stopStreaming : sendMessage}
                    disabled={!streaming && (!input.trim() || rateLimited)}
                    style={{
                      width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                      border: 'none', cursor: (streaming || (input.trim() && !rateLimited)) ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.25s', alignSelf: 'flex-end',
                      color: (input.trim() || streaming) ? '#1a1a1a' : 'rgba(255,255,255,0.2)',
                    }}
                    className={(input.trim() || streaming) && !rateLimited ? 'liquid-btn' : 'liquid-btn-inactive'}
                  >
                    {streaming ? <Icon.Stop /> : <Icon.Send />}
                  </button>
                </div>
              </div>

              <p style={{ textAlign: 'center', marginTop: '7px', fontFamily: 'Roboto Mono, monospace', fontSize: '10px', color: 'rgba(255,255,255,0.13)', letterSpacing: '0.07em' }}>
                {currentModel.label} · Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.md,.csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) console.log('File selected:', f.name); e.target.value = '' }} />

      {showSettings && (
        <SettingsPanel settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} username={username} />
      )}
    </>
  )
}
