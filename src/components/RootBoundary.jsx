import { Component } from 'react'

// Last line of defence, outside every provider. ScreenBoundary covers a crash
// in the active screen; this covers everything else — a provider, the sidebar,
// or a bad value in saved settings — so the worst case is a readable message
// with a recovery button instead of a white page.
export default class RootBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack)
  }

  // Clears the remembered screen and any cached app state, keeping the login
  // session, then reloads. Fixes the "reopens the broken screen forever" trap.
  reset = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('scrum-') && !/auth-token/.test(key)) localStorage.removeItem(key)
      }
    } catch { /* ignore */ }
    window.location.replace('/?fresh=' + Date.now())
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error?.message || String(this.state.error)
    const stack = (this.state.error?.stack || '').split('\n').slice(0, 4).join('\n')

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '-apple-system, system-ui, sans-serif', background: '#fafafa' }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 16, padding: 24, maxWidth: 460, width: '100%' }}>
          <h1 style={{ fontSize: 18, margin: '0 0 4px', color: '#374151' }}>Limitless Scrum hit a snag</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>
            Tap below to reset the app and reload. You'll stay logged in.
          </p>
          <button
            onClick={this.reset}
            style={{ fontSize: 15, fontWeight: 600, padding: '10px 16px', borderRadius: 12, border: '1px solid #F5C400', background: '#FFE27A', color: '#374151', cursor: 'pointer' }}
          >
            Reset and reload
          </button>
          {/* Printed so a screenshot is a complete bug report. */}
          <pre style={{ marginTop: 16, fontSize: 11, color: '#9ca3af', background: '#f9fafb', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message}{'\n'}{stack}
          </pre>
        </div>
      </div>
    )
  }
}
