import React, { useState } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://your-worker.your-subdomain.workers.dev'

const styles = {
  root: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  logo: {
    width: '32px',
    height: '32px',
    background: 'var(--text)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  logoSvg: {
    width: '18px',
    height: '18px',
    fill: 'var(--bg)',
  },
  title: {
    fontSize: '22px',
    fontWeight: '600',
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-2)',
    lineHeight: '1.5',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    background: 'var(--bg-3)',
    borderRadius: 'var(--radius-sm)',
    padding: '3px',
  },
  tab: {
    flex: 1,
    padding: '7px 12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    color: 'var(--text-2)',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  submitBtn: {
    width: '100%',
    padding: '11px',
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '4px',
    transition: 'opacity 0.15s',
    letterSpacing: '-0.01em',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(255,80,80,0.08)',
    border: '1px solid rgba(255,80,80,0.2)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    color: '#ff6b6b',
  },
  footer: {
    fontSize: '12px',
    color: 'var(--text-3)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
}

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.')
      return
    }
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const endpoint = mode === 'signup' ? '/auth/register' : '/auth/login'
      const res = await fetch(`${WORKER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      // data.token + data.username returned on success
      onLogin({ token: data.token, username: data.username })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setConfirmPassword('')
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>
            <svg style={styles.logoSvg} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.subtitle}>
            {mode === 'signin'
              ? 'Sign in to continue to your chats.'
              : 'Create an account to get started.'}
          </p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {['signin', 'signup'].map((m) => (
            <button
              key={m}
              style={{
                ...styles.tab,
                background: mode === m ? 'var(--bg-4)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-2)',
              }}
              onClick={() => switchMode(m)}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form style={styles.form} onSubmit={handleSubmit}>
          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              onFocus={(e) => (e.target.style.borderColor = 'var(--border-hover)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onFocus={(e) => (e.target.style.borderColor = 'var(--border-hover)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {mode === 'signup' && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm password</label>
              <input
                style={styles.input}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                onFocus={(e) => (e.target.style.borderColor = 'var(--border-hover)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
          )}

          <button
            style={{ ...styles.submitBtn, opacity: loading ? 0.6 : 1 }}
            type="submit"
            disabled={loading}
            onMouseEnter={(e) => !loading && (e.target.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.target.style.opacity = loading ? '0.6' : '1')}
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Your chats and settings sync across devices via Cloudflare KV.
        </p>
      </div>
    </div>
  )
}
