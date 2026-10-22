import { Component } from 'react'
import { AlertTriangle, Home } from 'lucide-react'

// Catches a crash in whatever screen is showing. Without this, one bad render
// unmounts the entire app and the user gets a blank white page with nothing to
// act on — and no way to tell us what broke. The screen that crashed is also
// the screen the app reopens on next launch, so this offers a way back to Home.
export default class ScreenBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    // Moving to another screen clears the error, so one broken page doesn't
    // stick around after navigating away.
    if (state.error && props.tab !== state.tab) return { error: null, tab: props.tab }
    if (state.tab !== props.tab) return { tab: props.tab }
    return null
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info?.componentStack)
  }

  goHome = () => {
    try { localStorage.setItem('scrum-active-tab', 'home') } catch { /* ignore */ }
    this.setState({ error: null })
    this.props.onHome?.()
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error?.message || String(this.state.error)

    return (
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-6 max-w-md w-full text-center">
            <AlertTriangle size={28} className="text-amber-500 mx-auto mb-2" />
            <h1 className="text-lg font-bold text-gray-700">This page hit a snag</h1>
            <p className="text-sm text-gray-500 mt-1">
              The rest of the app is fine — you can head back to Home.
            </p>

            <button
              onClick={this.goHome}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-yellow hover:bg-brand-yellow-dark text-gray-800 transition-colors"
            >
              <Home size={15} /> Back to Home
            </button>

            {/* Shown so a screenshot is enough to report the problem. */}
            <p className="mt-4 text-[11px] text-gray-400 break-words font-mono text-left bg-gray-50 rounded-lg p-2">
              {message}
            </p>
          </div>
        </main>
      </div>
    )
  }
}
