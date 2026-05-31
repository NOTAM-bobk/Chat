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

const RATE_LIMIT = { max: 10, windowMs: 60000 }

function genId() { return Math.random().toString(36).slice(2, 10) }

// ── Minimal markdown renderer ─────────────────────────────────────────────────
function renderMD(raw) {
  const codeBlocks = []
  let txt = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = codeBlocks.length
    codeBlocks.push({ lang: lang || 'code', code: code.trim() })
    return `\x00CODE${i}\x00`
  })
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  txt = esc(txt)
  txt = txt.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  txt = txt.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  txt = txt.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  txt = txt.replace(/\*(.+?)\*/g, '<em>$1</em>')
  txt = txt.replace(/~~(.+?)~~/g, '<del>$1</del>')
  txt = txt.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  txt = txt.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  txt = txt.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  txt = txt.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  txt = txt.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  txt = txt.replace(/^---+$/gm, '<hr>')
  txt = txt.replace(/^(\* |- )(.+)$/gm, '<li>$2</li>')
  txt = txt.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
  txt = txt.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, m => `<ul>${m}</ul>`)
  const parts = txt.split(/\n{2,}/)
  txt = parts.map(p => {
    const t = p.trim()
    if (!t) return ''
    if (/^\x00CODE/.test(t) || /^<(h[1-6]|ul|ol|li|hr|blockquote)/.test(t)) return t
    return `<p>${t.replace(/\n/g, '<br>')}</p>`
  }).filter(Boolean).join('\n')
  txt = txt.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
    const { lang, code } = codeBlocks[i]
    return `<pre class="code-block"><div class="code-header"><span class="code-lang">${esc(lang)}</span><button class="copy-code-btn" onclick="(function(btn){navigator.clipboard.writeText(btn.closest('pre').querySelector('code').textContent).then(()=>{btn.textContent='Copied';setTimeout(()=>btn.textContent='Copy',1800)})})(this)">Copy</button></div><code>${esc(code)}</code></pre>`
  })
  return txt
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const ChevronSvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
)
const ArrowUpSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
)
const StopSvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>
)
const CopySvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
)
const Retrysvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
)
const TrashSvg = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
)
const CheckSvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
)
const BotSvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
)
const HamburgerSvg = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
)
const PlusSvg = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
)
const SearchSvg = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
)
const ChatBubbleSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
)
const XSvg = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
)
const ChevronRightSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
)
const ArrowRightSvg = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
)
const ChevronDownFull = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
)
const AttachSvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.47"/></svg>
)
const ToolsSvg = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
)
const SunSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
)
const MoonSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
)
const ScrollDownSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
)

// ── Message component ─────────────────────────────────────────────────────────
function Message({ msg, onRetry }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(msg.content) } catch (_) {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="msg-row anim-in">
      {isUser ? (
        <div className="user-wrap">
          <div className="user-bubble">{msg.content}</div>
          <div className="user-meta">
            <button className="act" data-tip="Copy" onClick={handleCopy}>
              {copied ? <CheckSvg /> : <CopySvg />}
            </button>
          </div>
        </div>
      ) : (
        <div className="asst-wrap">
          <div className="asst-av"><BotSvg /></div>
          <div className="asst-body">
            {msg.streaming && msg.content === '' ? (
              <div className="typing">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            ) : (
              <div
                className="asst-text"
                dangerouslySetInnerHTML={{
                  __html: renderMD(msg.content) + (msg.streaming ? '<span class="cur"></span>' : '')
                }}
              />
            )}
            {!msg.streaming && (
              <div className="asst-meta">
                <button className="act" data-tip="Copy" onClick={handleCopy}>
                  {copied ? <CheckSvg /> : <CopySvg />}
                </button>
                <button className="act" data-tip="Retry" onClick={() => onRetry(msg)}>
                  <Retrysvg />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ settings, onSave, onClose, username }) {
  const [local, setLocal] = useState(settings)
  const [saved, setSaved] = useState(false)
  const handleSave = () => { onSave(local); setSaved(true); setTimeout(() => setSaved(false), 1500) }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '20px', width: '100%', maxWidth: '440px',
        padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', letterSpacing: '-0.01em' }}>Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: '4px', borderRadius: '6px' }}>
            <XSvg />
          </button>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--text-2)', padding: '8px 12px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          Signed in as <strong style={{ color: 'var(--text)' }}>{username}</strong>
        </div>

        <SField label="Model">
          <select value={local.model} onChange={e => setLocal(p => ({ ...p, model: e.target.value }))} style={sInputStyle}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}{m.tag ? ` — ${m.tag}` : ''}</option>)}
          </select>
        </SField>
        <SField label="System Prompt">
          <textarea value={local.systemPrompt} onChange={e => setLocal(p => ({ ...p, systemPrompt: e.target.value }))} rows={3}
            style={{ ...sInputStyle, resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '12px' }} />
        </SField>
        <SField label={`Temperature — ${local.temperature}`}>
          <input type="range" min="0" max="2" step="0.1" value={local.temperature}
            onChange={e => setLocal(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </SField>
        <SField label={`Max Tokens — ${local.maxTokens}`}>
          <input type="range" min="256" max="4096" step="256" value={local.maxTokens}
            onChange={e => setLocal(p => ({ ...p, maxTokens: parseInt(e.target.value) }))}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </SField>

        <button onClick={handleSave} style={{
          padding: '11px', background: 'var(--text)', color: 'var(--bg)',
          border: 'none', borderRadius: '12px', fontSize: '13.5px',
          fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
          letterSpacing: '-0.01em',
        }}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

const sInputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: '10px', color: 'var(--text)',
  fontSize: '13px', fontFamily: 'inherit', outline: 'none',
}

function SField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

// ── Greeting prompts ──────────────────────────────────────────────────────────
const PROMPTS = [
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>,
    title: 'Explain a concept',
    sub: 'How do neural networks actually learn?',
    text: 'Explain how neural networks learn from data',
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    title: 'Write some code',
    sub: 'Build a debounce function in TypeScript',
    text: 'Write a debounce function in TypeScript with proper typing',
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    title: 'Draft something',
    sub: 'Write a polite email to decline a meeting',
    text: 'Draft a polite email declining a meeting request while suggesting an async alternative',
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>,
    title: 'Brainstorm ideas',
    sub: '5 monetizable side projects for a developer',
    text: 'Give me 5 unique side project ideas for a developer that could be monetized',
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    title: 'Compare & summarize',
    sub: 'REST vs GraphQL: key differences?',
    text: 'Summarize the key differences between REST and GraphQL APIs for a technical audience',
  },
]

// ── Tools dropdown (portal) ───────────────────────────────────────────────────
const TOOL_OPTIONS = [
  { id: 'web', label: 'Search the web' },
  { id: 'think', label: 'Think step by step' },
  { id: 'research', label: 'Deep research' },
]

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App({ user, onLogout }) {
  const { token, username } = user

  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => localStorage.getItem('sb-expanded') === 'true')
  const [theme, setTheme] = useState(() => localStorage.getItem('ai-theme') || 'light')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [renamingChatId, setRenamingChatId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [showToolsDD, setShowToolsDD] = useState(false)
  const [toolsDDPos, setToolsDDPos] = useState({ x: 0, y: 0 })
  const [modelDDOpen, setModelDDOpen] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [topbarScrolled, setTopbarScrolled] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)

  // Rate limit
  const msgTimestamps = useRef([])
  const [rateLimited, setRateLimited] = useState(false)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)

  const abortRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const viewportRef = useRef(null)
  const toolsBtnRef = useRef(null)

  const activeChat = chats.find(c => c.id === activeChatId) || null
  const messages = activeChat?.messages || []

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ai-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('sb-expanded', sidebarExpanded)
    if (sidebarExpanded) setSearchVisible(true)
    else { setSearchVisible(false); setSearchFilter('') }
  }, [sidebarExpanded])

  // Rate limit countdown
  useEffect(() => {
    if (!rateLimited) return
    const interval = setInterval(() => {
      const now = Date.now()
      const recent = msgTimestamps.current.filter(t => now - t < RATE_LIMIT.windowMs)
      msgTimestamps.current = recent
      if (recent.length < RATE_LIMIT.max) { setRateLimited(false); setRateLimitCountdown(0) }
      else {
        const oldest = recent[0]
        setRateLimitCountdown(Math.ceil((RATE_LIMIT.windowMs - (now - oldest)) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [rateLimited])

  // Load history + settings
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

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close tools dropdown on outside click
  useEffect(() => {
    if (!showToolsDD) return
    const handler = e => {
      if (toolsBtnRef.current && !toolsBtnRef.current.contains(e.target)) setShowToolsDD(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showToolsDD])

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDDOpen) return
    const handler = () => setModelDDOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [modelDDOpen])

  // Persist
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

  // Auto-name
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

  // Chat management
  const newChat = () => {
    const chat = { id: genId(), title: 'New chat', messages: [], createdAt: new Date().toISOString() }
    const updated = [chat, ...chats]
    setChats(updated)
    setActiveChatId(chat.id)
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

  // Send message
  const sendMessage = async (overrideText) => {
    const text = (overrideText || input).trim()
    if (!text || streaming) return

    const now = Date.now()
    const recent = msgTimestamps.current.filter(t => now - t < RATE_LIMIT.windowMs)
    if (recent.length >= RATE_LIMIT.max) { msgTimestamps.current = recent; setRateLimited(true); return }
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
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }

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
            ? { ...c, messages: c.messages.map(m => m.id === assistantMsg.id ? { ...m, content: m.content || '*(stopped)*', streaming: false } : m) }
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
    const idx = messages.findIndex(m => m.id === msg.id)
    if (idx > 0 && messages[idx - 1].role === 'user') {
      const userText = messages[idx - 1].content
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

  const currentModelObj = MODELS.find(m => m.id === settings.model) || MODELS[0]

  // Viewport scroll tracking
  const handleViewportScroll = () => {
    const vp = viewportRef.current
    if (!vp) return
    const dist = vp.scrollHeight - vp.scrollTop - vp.clientHeight
    setShowScrollBtn(dist > 150 && messages.length > 0)
    setTopbarScrolled(vp.scrollTop > 10)
  }

  const scrollToBottom = (smooth = false) => {
    const vp = viewportRef.current
    if (vp) vp.scrollTo({ top: vp.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
  }

  // Filtered chat history
  const filteredChats = chats.filter(c => !searchFilter || c.title.toLowerCase().includes(searchFilter.toLowerCase()))
  const now = Date.now()
  const todayChats = filteredChats.filter(c => now - (c.ts || 0) < 86400000)
  const yesterdayChats = filteredChats.filter(c => { const a = now - (c.ts || 0); return a >= 86400000 && a < 172800000 })
  const olderChats = filteredChats.filter(c => now - (c.ts || 0) >= 172800000)

  const renderHistoryGroup = (label, arr) => arr.length === 0 ? null : (
    <>
      <div className="sb-section-label">{label}</div>
      {arr.map(chat => (
        <div key={chat.id} className={`history-item${chat.id === activeChatId ? ' active' : ''}`}
          onClick={() => { setActiveChatId(chat.id) }}>
          <ChatBubbleSvg />
          {renamingChatId === chat.id ? (
            <input
              autoFocus value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => finishRename(chat.id)}
              onKeyDown={e => { if (e.key === 'Enter') finishRename(chat.id); if (e.key === 'Escape') setRenamingChatId(null) }}
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font)', padding: 0, width: 0 }}
            />
          ) : (
            <span className="hi-title">{chat.title || 'Untitled'}</span>
          )}
          <button className="hi-del" onClick={e => { e.stopPropagation(); deleteChat(chat.id) }} title="Delete">
            <XSvg />
          </button>
        </div>
      ))}
    </>
  )

  // Tools dropdown toggle
  const toggleToolsDD = (e) => {
    e.stopPropagation()
    if (showToolsDD) { setShowToolsDD(false); return }
    const rect = toolsBtnRef.current?.getBoundingClientRect()
    if (rect) setToolsDDPos({ x: rect.left, y: rect.top - 8 })
    setShowToolsDD(true)
  }

  const pickTool = (label) => {
    setShowToolsDD(false)
    const prefix = `[${label}] `
    setInput(prev => prefix + prev)
    textareaRef.current?.focus()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

        :root{
          --bg:#f7f6f3;--surface:#ffffff;--surface2:#f0ede8;--surface3:#e6e2db;
          --border:rgba(0,0,0,0.07);--border2:rgba(0,0,0,0.04);
          --text:#1a1714;--text-2:#6b6660;--text-3:#b0aca6;
          --accent:#c47a3a;--accent-dim:rgba(196,122,58,0.1);
          --user-bubble:#1a1714;--user-fg:#f7f6f3;
          --shadow-sm:0 1px 3px rgba(0,0,0,0.05),0 1px 2px rgba(0,0,0,0.03);
          --shadow-md:0 4px 16px rgba(0,0,0,0.07),0 2px 4px rgba(0,0,0,0.04);
          --shadow-lg:0 12px 40px rgba(0,0,0,0.1),0 4px 8px rgba(0,0,0,0.05);
          --sidebar-collapsed:60px;--sidebar-expanded:240px;
          --font:'DM Sans',system-ui,sans-serif;
          --serif:'Instrument Serif',Georgia,serif;
          --mono:'DM Mono',ui-monospace,monospace;
          --ease:cubic-bezier(0.4,0,0.2,1);--transition:0.2s var(--ease);
        }
        [data-theme=dark]{
          --bg:#111009;--surface:#1c1a16;--surface2:#252219;--surface3:#312e24;
          --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.04);
          --text:#f2ede6;--text-2:#9a9489;--text-3:#544f49;
          --accent:#d4935a;--accent-dim:rgba(212,147,90,0.12);
          --user-bubble:#252219;--user-fg:#e8e2d8;
          --shadow-sm:0 1px 3px rgba(0,0,0,0.3);
          --shadow-md:0 4px 16px rgba(0,0,0,0.4);
          --shadow-lg:0 12px 40px rgba(0,0,0,0.5);
        }

        html,body,#root{height:100%;font-family:var(--font);-webkit-font-smoothing:antialiased}
        body{background:var(--bg);color:var(--text);overflow:hidden}

        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:10px}

        .app-shell{display:flex;height:100svh;overflow:hidden;transition:background var(--transition),color var(--transition)}

        /* ── Sidebar ── */
        #sidebar{
          width:var(--sidebar-collapsed);background:var(--surface);
          border-radius:16px;margin:8px 0 8px 8px;border:1px solid var(--border);
          display:flex;flex-direction:column;align-items:center;
          transition:width 0.28s cubic-bezier(0.4,0,0.2,1);
          z-index:30;overflow:hidden;flex-shrink:0;position:relative;
          box-shadow:var(--shadow-sm);
        }
        #sidebar.expanded{width:var(--sidebar-expanded)}

        .sb-top{
          width:100%;display:flex;flex-direction:column;align-items:center;
          padding:8px 0 8px;gap:2px;border-bottom:1px solid var(--border);
        }
        .sb-brand{
          width:100%;display:flex;align-items:center;
          padding:4px 14px;margin-bottom:2px;min-height:40px;
        }
        .sb-brand-name{
          font-size:15px;font-weight:600;color:var(--text);letter-spacing:-0.02em;
          opacity:0;width:0;overflow:hidden;white-space:nowrap;margin-left:0;
          transition:opacity 0.15s var(--ease),width 0.28s var(--ease),margin-left 0.28s var(--ease);
        }
        #sidebar.expanded .sb-brand-name{opacity:1;width:auto;margin-left:10px;}

        .sb-btn{
          width:calc(100% - 16px);min-height:36px;display:flex;align-items:center;
          padding:0 10px;border-radius:10px;border:none;background:none;cursor:pointer;
          color:var(--text-2);transition:background var(--transition),color var(--transition);
          position:relative;flex-shrink:0;
        }
        .sb-btn:hover{background:var(--surface2);color:var(--text)}
        .sb-btn svg{width:17px;height:17px;flex-shrink:0}

        #sidebar:not(.expanded) .sb-btn[data-tip]::after{
          content:attr(data-tip);position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);
          background:var(--text);color:var(--bg);font-size:12px;padding:4px 9px;border-radius:7px;
          white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.12s;z-index:200;
          font-family:var(--font);
        }
        #sidebar:not(.expanded) .sb-btn[data-tip]:hover::after{opacity:1}

        .sb-toggle{
          margin-top:auto;width:calc(100% - 16px);min-height:36px;
          display:flex;align-items:center;padding:0 10px;border-radius:10px;
          border:none;background:none;cursor:pointer;color:var(--text-3);
          transition:background var(--transition),color var(--transition);margin-bottom:8px;flex-shrink:0;
        }
        .sb-toggle:hover{background:var(--surface2);color:var(--text-2)}
        .sb-toggle svg{width:16px;height:16px;flex-shrink:0;transition:transform 0.28s var(--ease)}
        #sidebar.expanded .sb-toggle svg.chevron{transform:rotate(180deg)}
        .sb-toggle-label{
          font-size:12.5px;color:var(--text-3);opacity:0;width:0;margin-left:0;white-space:nowrap;
          transition:opacity 0.15s var(--ease),width 0.28s var(--ease),margin-left 0.28s var(--ease);
        }
        #sidebar.expanded .sb-toggle-label{opacity:1;width:auto;margin-left:10px;}

        .sb-history{flex:1;width:100%;overflow:hidden;display:flex;flex-direction:column;}
        .sb-history-inner{flex:1;overflow-y:auto;overflow-x:hidden;padding:6px 8px;}

        .sb-section-label{
          font-size:10.5px;font-weight:600;color:var(--text-3);
          padding:8px 10px 4px;letter-spacing:0.08em;text-transform:uppercase;
          white-space:nowrap;overflow:hidden;opacity:0;
          transition:opacity 0.15s var(--ease);pointer-events:none;
        }
        #sidebar.expanded .sb-section-label{opacity:1;pointer-events:auto;}

        .history-item{
          width:100%;display:flex;align-items:center;padding:6px 10px;border-radius:8px;
          cursor:pointer;color:var(--text-2);transition:background var(--transition),color var(--transition);
          gap:8px;position:relative;white-space:nowrap;overflow:hidden;
        }
        .history-item:hover{background:var(--surface2);color:var(--text)}
        .history-item.active{background:var(--surface2);color:var(--text);font-weight:500}
        .history-item svg{width:14px;height:14px;flex-shrink:0;opacity:0.45}
        .hi-title{font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;opacity:0;width:0;transition:opacity 0.15s var(--ease),width 0.28s var(--ease);}
        #sidebar.expanded .hi-title{opacity:1;width:auto;}
        .hi-del{width:20px;height:20px;border:none;background:none;cursor:pointer;border-radius:5px;display:none;align-items:center;justify-content:center;color:var(--text-3);flex-shrink:0;}
        #sidebar.expanded .history-item:hover .hi-del{display:flex}
        .hi-del:hover{background:var(--surface3);color:var(--text-2)}

        /* ── Main ── */
        #main{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;min-width:0}

        /* ── Topbar ── */
        #topbar{
          display:flex;align-items:center;gap:6px;padding:10px 16px;
          position:absolute;top:0;left:0;right:0;z-index:10;background:var(--bg);
          border-bottom:1px solid transparent;
          transition:border-color var(--transition),background var(--transition);
        }
        #topbar.scrolled{border-color:var(--border)}
        .topbar-center{flex:1;display:flex;justify-content:center}
        .model-btn{
          display:flex;align-items:center;gap:6px;font-size:14px;font-weight:500;color:var(--text-2);
          padding:5px 10px;border-radius:9px;border:1px solid transparent;background:none;cursor:pointer;
          transition:background var(--transition),border-color var(--transition),color var(--transition);
          letter-spacing:-0.01em;position:relative;
        }
        .model-btn:hover{background:var(--surface);border-color:var(--border);color:var(--text)}
        .model-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0}
        .topbar-r{display:flex;align-items:center;gap:4px}
        .icon-btn{
          width:32px;height:32px;border:none;background:none;cursor:pointer;
          border-radius:8px;display:flex;align-items:center;justify-content:center;
          color:var(--text-2);transition:background var(--transition),color var(--transition);
        }
        .icon-btn:hover{background:var(--surface2);color:var(--text)}
        .icon-btn svg{width:16px;height:16px}

        /* Model dropdown */
        .model-dropdown{
          position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);
          background:var(--surface);border:1px solid var(--border);border-radius:13px;
          box-shadow:var(--shadow-lg);min-width:220px;padding:5px;z-index:200;
          animation:dropIn 0.15s ease;
        }
        @keyframes dropIn{from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .mdl-item{
          display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;
          font-size:13.5px;color:var(--text-2);transition:background var(--transition),color var(--transition);
        }
        .mdl-item:hover{background:var(--surface2);color:var(--text)}
        .mdl-item.selected{color:var(--text);font-weight:500}
        .mdl-item .mdl-dot{width:8px;height:8px;border-radius:50%;background:var(--surface3);flex-shrink:0}
        .mdl-item.selected .mdl-dot{background:var(--accent)}
        .mdl-badge{margin-left:auto;font-size:10.5px;font-weight:500;background:var(--surface2);color:var(--text-3);padding:2px 7px;border-radius:5px}

        /* ── Viewport ── */
        #viewport{flex:1;overflow-y:auto;padding:56px 0 0;display:flex;flex-direction:column;}

        /* ── Empty / Greeting ── */
        .empty-state{
          flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:0 20px 100px;
        }
        .greeting-label{
          font-size:11px;font-weight:600;color:var(--text-3);letter-spacing:0.12em;
          text-transform:uppercase;margin-bottom:14px;
          animation:fadeUp 0.5s both 0.05s;
        }
        .greeting-title{
          font-family:var(--serif);font-size:38px;color:var(--text);
          letter-spacing:-0.01em;line-height:1.15;text-align:center;margin-bottom:8px;
          animation:fadeUp 0.5s both 0.1s;
        }
        .greeting-title em{font-style:italic;color:var(--accent)}
        .greeting-sub{
          font-size:15px;color:var(--text-2);margin-bottom:40px;text-align:center;
          line-height:1.55;max-width:340px;animation:fadeUp 0.5s both 0.15s;
        }
        .prompts-list{
          display:flex;flex-direction:column;gap:8px;width:100%;max-width:520px;
          animation:fadeUp 0.5s both 0.2s;
        }
        .prompt-card{
          display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:13px;cursor:pointer;
          background:var(--surface);border:1px solid var(--border);
          transition:background var(--transition),border-color var(--transition),transform var(--transition),box-shadow var(--transition);
          box-shadow:var(--shadow-sm);text-align:left;
        }
        .prompt-card:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow-md);}
        .prompt-icon{
          width:34px;height:34px;border-radius:9px;background:var(--surface2);
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
          transition:background var(--transition);
        }
        .prompt-card:hover .prompt-icon{background:var(--accent-dim)}
        .prompt-icon svg{color:var(--text-2);transition:color var(--transition)}
        .prompt-card:hover .prompt-icon svg{color:var(--accent)}
        .prompt-text strong{display:block;font-size:14px;font-weight:500;color:var(--text);margin-bottom:2px}
        .prompt-text span{font-size:12.5px;color:var(--text-2)}
        .prompt-arrow{margin-left:auto;color:var(--text-3);opacity:0;transform:translateX(-4px);transition:opacity var(--transition),transform var(--transition)}
        .prompt-card:hover .prompt-arrow{opacity:1;transform:translateX(0)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

        /* ── Messages ── */
        .msg-row{width:100%;max-width:680px;margin:0 auto;padding:6px 20px;}
        .msg-row.anim-in{animation:msgIn 0.22s cubic-bezier(0.34,1.2,0.64,1) both}
        @keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

        .user-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
        .user-bubble{
          background:var(--user-bubble);color:var(--user-fg);
          border-radius:18px 18px 4px 18px;padding:11px 16px;max-width:80%;
          font-size:15px;line-height:1.6;word-break:break-word;box-shadow:var(--shadow-sm);
          white-space:pre-wrap;
        }
        .user-meta{display:flex;gap:3px;opacity:0;transition:opacity var(--transition)}
        .user-wrap:hover .user-meta{opacity:1}

        .asst-wrap{display:flex;gap:12px;align-items:flex-start}
        .asst-av{
          width:28px;height:28px;border-radius:8px;flex-shrink:0;margin-top:2px;
          background:var(--text);display:flex;align-items:center;justify-content:center;
        }
        .asst-av svg{color:var(--bg)}
        .asst-body{flex:1;min-width:0}
        .asst-text{font-size:15.5px;line-height:1.8;color:var(--text);word-break:break-word}
        .asst-text p{margin-bottom:0.9em}.asst-text p:last-child{margin-bottom:0}
        .asst-text h1,.asst-text h2,.asst-text h3{font-weight:600;letter-spacing:-0.01em;margin:1.2em 0 0.45em;color:var(--text)}
        .asst-text h1{font-size:20px}.asst-text h2{font-size:18px}.asst-text h3{font-size:16px}
        .asst-text strong{font-weight:600}
        .asst-text em{font-style:italic;color:var(--text-2)}
        .asst-text code{font-family:var(--mono);font-size:13px;background:var(--surface2);padding:2px 6px;border-radius:5px;border:1px solid var(--border);color:var(--accent)}
        .code-block{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:12px 0;box-shadow:var(--shadow-sm)}
        .code-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--surface2);border-bottom:1px solid var(--border)}
        .code-lang{font-family:var(--mono);font-size:11px;color:var(--text-3);font-weight:500;text-transform:uppercase;letter-spacing:0.06em}
        .copy-code-btn{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-2);background:none;border:none;cursor:pointer;border-radius:5px;padding:2px 7px;transition:background var(--transition),color var(--transition);font-family:var(--font)}
        .copy-code-btn:hover{background:var(--surface3);color:var(--text)}
        .asst-text pre code{display:block;padding:14px 16px;font-family:var(--mono);font-size:13px;line-height:1.75;background:none;border:none;color:var(--text-2);overflow-x:auto}
        .asst-text ul,.asst-text ol{padding-left:1.4em;margin-bottom:0.9em}
        .asst-text li{margin-bottom:0.35em;line-height:1.7}
        .asst-text blockquote{border-left:2px solid var(--accent);padding:8px 14px;margin:12px 0;background:var(--accent-dim);border-radius:0 8px 8px 0;color:var(--text-2)}
        .asst-text hr{border:none;border-top:1px solid var(--border);margin:18px 0}
        .asst-text a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent;transition:border-color var(--transition)}
        .asst-text a:hover{border-color:var(--accent)}
        .asst-text table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
        .asst-text th,.asst-text td{padding:9px 13px;border:1px solid var(--border);text-align:left}
        .asst-text th{background:var(--surface2);font-weight:500;font-size:13px}
        .asst-text tr:nth-child(even) td{background:var(--surface2)}

        .asst-meta{display:flex;align-items:center;gap:2px;padding-top:8px;opacity:0;transition:opacity var(--transition)}
        .asst-wrap:hover .asst-meta{opacity:1}

        .act{width:28px;height:28px;border:none;background:none;cursor:pointer;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--text-3);transition:background var(--transition),color var(--transition);position:relative}
        .act:hover{background:var(--surface2);color:var(--text-2)}
        .act svg{width:13px;height:13px}
        .act[data-tip]::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);font-size:11px;white-space:nowrap;padding:3px 8px;border-radius:5px;pointer-events:none;opacity:0;transition:opacity 0.12s;z-index:50;font-family:var(--font)}
        .act:hover[data-tip]::after{opacity:1}

        .typing{display:flex;gap:5px;align-items:center;padding:12px 0 6px}
        .typing-dot{width:6px;height:6px;border-radius:50%;background:var(--text-3);animation:typingDot 1.4s ease-in-out infinite}
        .typing-dot:nth-child(2){animation-delay:.15s}.typing-dot:nth-child(3){animation-delay:.3s}
        @keyframes typingDot{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}

        .cur{display:inline-block;width:1.5px;height:16px;background:var(--text);border-radius:1px;animation:curBlink 0.9s steps(1) infinite;vertical-align:text-bottom;margin-left:2px}
        @keyframes curBlink{0%,100%{opacity:1}50%{opacity:0}}

        /* ── Composer ── */
        #footer-anchor{position:sticky;bottom:0;background:linear-gradient(to top,var(--bg) 75%,transparent);padding:12px 20px 18px;z-index:5;}
        .footer-inner{max-width:680px;margin:0 auto;position:relative}

        .scroll-btn{
          display:none;position:absolute;top:-52px;left:50%;transform:translateX(-50%);
          width:30px;height:30px;border-radius:50%;border:1px solid var(--border);
          background:var(--surface);box-shadow:var(--shadow-md);cursor:pointer;color:var(--text-2);
          align-items:center;justify-content:center;transition:background var(--transition);
        }
        .scroll-btn.visible{display:flex}
        .scroll-btn:hover{background:var(--surface2)}

        #composer{
          background:var(--surface);border:1px solid var(--border);border-radius:20px;
          box-shadow:var(--shadow-md);
          transition:box-shadow 0.25s var(--ease),border-color 0.25s var(--ease);overflow:hidden;
        }
        #composer:focus-within{
          box-shadow:var(--shadow-lg),0 0 0 3px var(--accent-dim);
          border-color:rgba(196,122,58,0.25);
        }
        .composer-top{display:flex;align-items:flex-end;gap:10px;padding:14px 14px 10px 18px;}
        #msg-input{
          flex:1;border:none;background:none;font:inherit;font-size:15.5px;line-height:1.55;
          color:var(--text);outline:none;resize:none;max-height:180px;overflow-y:auto;min-height:24px;padding:0;
        }
        #msg-input::placeholder{color:var(--text-3)}
        .composer-bottom{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 12px;}
        .composer-left{display:flex;align-items:center;gap:6px}
        .composer-right{display:flex;align-items:center;gap:8px}

        .pill-btn{
          display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:20px;
          padding:5px 11px;font-size:12.5px;font-weight:500;color:var(--text-2);background:none;cursor:pointer;
          transition:background var(--transition),border-color var(--transition),color var(--transition);
        }
        .pill-btn:hover{background:var(--surface2);color:var(--text)}
        .pill-btn svg{width:13px;height:13px}

        .send-btn{
          width:36px;height:36px;border-radius:12px;border:none;cursor:pointer;
          background:var(--text);color:var(--bg);display:flex;align-items:center;justify-content:center;
          transition:opacity var(--transition),transform var(--transition);
        }
        .send-btn:not(:disabled):hover{opacity:0.82;transform:scale(1.05)}
        .send-btn:disabled{opacity:0.16;cursor:not-allowed}
        .stop-btn{
          width:36px;height:36px;border-radius:12px;border:1px solid var(--border);cursor:pointer;
          background:var(--surface2);color:var(--text-2);display:flex;align-items:center;justify-content:center;
          transition:background var(--transition);
        }
        .stop-btn:hover{background:var(--surface3);color:var(--text)}

        /* Tools portal */
        .tools-portal{
          position:fixed;background:var(--surface);border:1px solid var(--border);
          border-radius:14px;box-shadow:var(--shadow-lg);min-width:210px;padding:5px;
          z-index:9999;animation:dropUp 0.15s ease;transform:translateY(-100%);
        }
        @keyframes dropUp{from{opacity:0;transform:translateY(calc(-100% + 6px))}to{opacity:1;transform:translateY(-100%)}}
        .tool-dd-item{
          display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;cursor:pointer;
          font-size:13.5px;color:var(--text-2);transition:background var(--transition);
        }
        .tool-dd-item:hover{background:var(--surface2);color:var(--text)}

        /* Rate limit */
        .rate-limit-msg{text-align:center;margin-bottom:8px;font-size:12px;color:#d97706;font-family:var(--mono)}

        /* Mobile */
        @media(max-width:640px){
          #sidebar{position:fixed;left:8px;top:8px;height:calc(100% - 16px);z-index:50;transform:translateX(calc(-100% - 16px))}
          #sidebar.mobile-open{transform:translateX(0)}
          .msg-row{padding:5px 14px}
          .greeting-title{font-size:28px}
        }
      `}</style>

      <div className="app-shell">

        {/* ── Sidebar ── */}
        <aside id={`sidebar${sidebarExpanded ? ' expanded' : ''}`} className={sidebarExpanded ? 'expanded' : ''} style={{ width: sidebarExpanded ? 'var(--sidebar-expanded)' : 'var(--sidebar-collapsed)' }}>
          <div className="sb-top">
            <div className="sb-brand">
              <button
                className="sb-btn"
                onClick={() => setSidebarExpanded(p => !p)}
                title="Toggle sidebar"
                style={{ width: '32px', height: '32px', minHeight: 'unset', padding: 0, justifyContent: 'center', flexShrink: 0, borderRadius: '9px' }}
              >
                <HamburgerSvg />
              </button>
              <span className="sb-brand-name">AI Chat</span>
            </div>

            <button className="sb-btn" onClick={newChat} data-tip="New chat" title="New chat">
              <PlusSvg />
              <span className="sb-label" style={{ fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? 'auto' : 0, marginLeft: sidebarExpanded ? '10px' : 0, transition: 'opacity 0.15s var(--ease),width 0.28s var(--ease),margin-left 0.28s var(--ease)', pointerEvents: 'none' }}>New chat</span>
            </button>

            <button className="sb-btn" onClick={() => { if (!sidebarExpanded) setSidebarExpanded(true); setTimeout(() => document.getElementById('sb-search')?.focus(), 300) }} data-tip="Search" title="Search">
              <SearchSvg />
              <span className="sb-label" style={{ fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? 'auto' : 0, marginLeft: sidebarExpanded ? '10px' : 0, transition: 'opacity 0.15s var(--ease),width 0.28s var(--ease),margin-left 0.28s var(--ease)', pointerEvents: 'none' }}>Search</span>
            </button>

            {sidebarExpanded && (
              <div style={{ width: 'calc(100% - 16px)', padding: '0 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface2)', borderRadius: '9px', padding: '7px 10px', border: '1px solid var(--border2)' }}>
                  <SearchSvg />
                  <input id="sb-search" type="text" placeholder="Search chats…" value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                    style={{ border: 'none', background: 'none', font: 'inherit', fontSize: '13px', color: 'var(--text)', outline: 'none', width: '100%' }} />
                </div>
              </div>
            )}
          </div>

          <div className="sb-history">
            <div className="sb-history-inner">
              {loadingHistory ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: '13px', color: 'var(--text-3)' }}>Loading…</div>
              ) : filteredChats.length === 0 ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: '13px', color: 'var(--text-3)' }}>{searchFilter ? 'No results' : 'No chats yet'}</div>
              ) : (
                <>
                  {renderHistoryGroup('Today', todayChats)}
                  {renderHistoryGroup('Yesterday', yesterdayChats)}
                  {renderHistoryGroup('Older', olderChats)}
                  {todayChats.length === 0 && yesterdayChats.length === 0 && olderChats.length === 0 && renderHistoryGroup('', filteredChats)}
                </>
              )}
            </div>
          </div>

          <button className="sb-toggle" onClick={() => setSidebarExpanded(p => !p)} title="Toggle sidebar">
            <ChevronRightSvg className="chevron" style={{ transform: sidebarExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.28s var(--ease)' }} />
            <span className="sb-toggle-label">Collapse</span>
          </button>
        </aside>

        {/* ── Main ── */}
        <main id="main">
          {/* Topbar */}
          <div id="topbar" className={topbarScrolled ? 'scrolled' : ''}>
            <div className="topbar-center">
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <button className="model-btn" onClick={e => { e.stopPropagation(); setModelDDOpen(p => !p) }}>
                  <span className="model-dot" />
                  <span>{currentModelObj.label}</span>
                  <ChevronDownFull style={{ transform: modelDDOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {modelDDOpen && (
                  <div className="model-dropdown">
                    {MODELS.map(m => (
                      <div key={m.id} className={`mdl-item${m.id === settings.model ? ' selected' : ''}`}
                        onClick={() => { setSettings(s => ({ ...s, model: m.id })); persistSettings({ ...settings, model: m.id }); setModelDDOpen(false) }}>
                        <span className="mdl-dot" />
                        {m.label}
                        {m.tag && <span className="mdl-badge">{m.tag}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="topbar-r">
              <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme">
                {theme === 'dark' ? <MoonSvg /> : <SunSvg />}
              </button>
              <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
              {onLogout && (
                <button className="icon-btn" onClick={onLogout} title="Sign out">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Viewport */}
          <div id="viewport" ref={viewportRef} onScroll={handleViewportScroll}>
            {messages.length === 0 ? (
              <div className="empty-state">
                <p className="greeting-label">Your AI assistant</p>
                <h1 className="greeting-title">Hello, <em>what's on<br />your mind?</em></h1>
                <p className="greeting-sub">Ask me anything — I can write, reason, code, and help you think through any problem.</p>
                <div className="prompts-list">
                  {PROMPTS.map(p => (
                    <div key={p.title} className="prompt-card" onClick={() => { setInput(p.text); textareaRef.current?.focus() }}>
                      <div className="prompt-icon">{p.icon}</div>
                      <div className="prompt-text">
                        <strong>{p.title}</strong>
                        <span>{p.sub}</span>
                      </div>
                      <span className="prompt-arrow"><ArrowRightSvg /></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {messages.map(msg => (
                  <Message key={msg.id} msg={msg} onRetry={handleRetry} />
                ))}
              </div>
            )}
            <div style={{ flex: 1, minHeight: '8px' }} />

            {/* Footer */}
            <div id="footer-anchor">
              <div className="footer-inner">
                <button className={`scroll-btn${showScrollBtn ? ' visible' : ''}`} onClick={() => scrollToBottom(true)}>
                  <ScrollDownSvg />
                </button>

                {rateLimited && (
                  <div className="rate-limit-msg">Rate limit reached — wait {rateLimitCountdown}s</div>
                )}

                <div id="composer">
                  <div className="composer-top">
                    <textarea
                      id="msg-input"
                      ref={textareaRef}
                      rows={1}
                      placeholder="Ask anything…"
                      value={input}
                      onChange={e => {
                        setInput(e.target.value)
                        e.target.style.height = 'auto'
                        e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'
                      }}
                      onKeyDown={handleKeyDown}
                      aria-label="Message"
                    />
                  </div>
                  <div className="composer-bottom">
                    <div className="composer-left">
                      <button className="pill-btn" title="Attach file">
                        <AttachSvg /> Attach
                      </button>
                      <button className="pill-btn" ref={toolsBtnRef} onClick={toggleToolsDD} title="Tools">
                        <ToolsSvg /> Tools
                      </button>
                    </div>
                    <div className="composer-right">
                      {streaming ? (
                        <button className="stop-btn" onClick={stopStreaming}><StopSvg /></button>
                      ) : (
                        <button className="send-btn" onClick={() => sendMessage()} disabled={!input.trim() || rateLimited}>
                          <ArrowUpSvg />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div ref={bottomRef} />
          </div>
        </main>
      </div>

      {/* Tools portal */}
      {showToolsDD && (
        <div className="tools-portal" style={{ left: `${toolsDDPos.x}px`, top: `${toolsDDPos.y}px` }}>
          {TOOL_OPTIONS.map(t => (
            <div key={t.id} className="tool-dd-item" onClick={() => pickTool(t.label)}>{t.label}</div>
          ))}
        </div>
      )}

      {/* Settings */}
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
