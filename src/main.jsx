import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import LoginScreen from './LoginScreen.jsx'
import App from './App.jsx'

const SESSION_KEY = 'cf_chat_session'

function Root() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.token && parsed?.username) setUser(parsed)
      }
    } catch (_) {}
    setReady(true)
  }, [])

  const handleLogin = (session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)
  }

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  if (!ready) return null

  if (!user) return <LoginScreen onLogin={handleLogin} />

  return <App user={user} onLogout={handleLogout} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
