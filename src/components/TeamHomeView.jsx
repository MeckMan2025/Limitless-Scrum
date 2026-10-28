import { useState } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { FolderKanban, Smartphone, X, Send, CheckCircle, ChevronLeft, ChevronRight,
  Home, Calendar, Shield, Lightbulb, User, Settings, Megaphone } from 'lucide-react'
import { TEAM_TABS } from '../data/teamTabs'

// The icon each tab is drawn with. Keyed by the name the shared list uses, so
// a new tab names its icon there and this needs no edit.
const TAB_ICONS = {
  Home, FolderKanban, Calendar, Shield, Lightbulb, User, Settings,
}
import { useUser } from '../contexts/UserContext'
import { stampTeam } from '../lib/teamScope'
import NotificationBell from './NotificationBell'

// Built from the list App.jsx enforces, so the guide and the app can never
// disagree about what a team has.
const TAB_INFO = TEAM_TABS.map(t => ({
  icon: TAB_ICONS[t.icon] || Lightbulb,
  name: t.name,
  color: 'text-brand-blue-dark',
  bg: 'bg-brand-blue/25',
  description: t.description,
}))


const TEAM_UPDATES = [
  {
    date: 'Now',
    items: [
      'Your boards are yours. Make tasks, drag them along, and nobody outside your team can see any of it.',
      'Your coach adds your members and mentors from User Management — you run your own roster.',
      'The calendar carries meetings, competitions and deadlines.',
      'Suggestions goes straight to us. If something is missing, that is where to say so.',
    ],
  },
]


const USAGE_OPTIONS = [
  'Every day',
  'A few times a week',
  'Once a week',
  'At competitions only',
  'Just trying it out',
]

function TeamHomeView({ onTabChange }) {
  const { username, teamNumber } = useUser()
  // The profile is stored as "Team <number> - <name>", so the name is whatever
  // follows the dash. Blank when it does not parse, rather than showing the
  // raw display name back at them.
  const teamName = (username || '').includes(' - ')
    ? username.split(' - ').slice(1).join(' - ').trim()
    : ''
  const storageKey = `team-welcome-seen-${teamNumber || 'default'}`
  const [hasSeenWelcome, setHasSeenWelcome] = useState(() => localStorage.getItem(storageKey) === 'true')
  const [showPopup, setShowPopup] = useState(true)
  const [slide, setSlide] = useState(0)

  // Survey state
  const [featureRequest, setFeatureRequest] = useState('')
  const [usageFrequency, setUsageFrequency] = useState('')
  const [surveySubmitted, setSurveySubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const markSeen = () => {
    localStorage.setItem(storageKey, 'true')
    setHasSeenWelcome(true)
  }

  const closePopup = () => {
    if (!hasSeenWelcome) markSeen()
    setShowPopup(false)
  }

  const handleSurveySubmit = async () => {
    if (!featureRequest.trim() && !usageFrequency) return
    setSubmitting(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      await fetch(`${supabaseUrl}/rest/v1/team_survey_responses`, {
        method: 'POST',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        // Radical's own answers stay unstamped (NULL), like every other table;
        // '' was a third spelling of Radical.
        body: JSON.stringify(stampTeam({
          team_name: username || '',
          feature_request: featureRequest.trim(),
          usage_frequency: usageFrequency,
          submitted_at: new Date().toISOString(),
        }, teamNumber)),
      })
    } catch (err) {
      console.error('Failed to submit survey:', err)
    }
    setSurveySubmitted(true)
    setSubmitting(false)
    markSeen()
  }

  const handleSkipSurvey = () => {
    markSeen()
  }

  // Build slides
  const slides = []

  slides.push(
    <div className="flex flex-col items-center justify-center text-center py-6">
      <img src={`${import.meta.env.BASE_URL}ScrumLogo-transparent.png`} alt="Scrum Logo" className="w-16 h-16 mb-3 drop-shadow-lg" />
      <h2 className="text-xl font-bold text-gray-800 mb-2">
        Welcome{teamNumber ? `, Team ${teamNumber}` : ''}!
      </h2>
      <p className="text-sm text-gray-600 max-w-xs">
        This is your team's private workspace. Use the arrows to see what you can do.
      </p>
    </div>
  )

  slides.push(
    <div>
      <h3 className="text-base font-bold text-gray-800 text-center mb-3">What each tab does</h3>
      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        {TAB_INFO.map(({ icon: Icon, name, color, bg, description }) => (
          <div key={name} className="bg-gray-50 rounded-xl p-3 flex gap-3 items-start">
            <div className={`${bg} p-2 rounded-lg shrink-0`}>
              <Icon size={16} className={color} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 text-sm">{name}</h4>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  slides.push(
    <div>
      <div className="flex items-center justify-center gap-2 mb-3">
        <Smartphone size={18} className="text-brand-blue-dark" />
        <h3 className="text-base font-bold text-gray-800">Add to your phone</h3>
      </div>
      <img
        src={`${import.meta.env.BASE_URL}install-guide.png`}
        alt="How to install on your phone"
        className="w-full rounded-lg"
        onError={(e) => { e.target.style.display = 'none' }}
      />
    </div>
  )

  if (!hasSeenWelcome) {
    slides.push(
      <div>
        <h3 className="text-base font-bold text-gray-800 text-center mb-3">Quick Survey</h3>
        {surveySubmitted ? (
          <div className="text-center py-4">
            <CheckCircle size={36} className="text-green-400 mx-auto mb-2" />
            <p className="font-semibold text-gray-800">Thanks for the feedback!</p>
            <p className="text-sm text-gray-500 mt-1">We'll use this to make the app better.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often would your team use this app?
              </label>
              <div className="flex flex-wrap gap-2">
                {USAGE_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setUsageFrequency(option)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      usageFrequency === option
                        ? 'bg-brand-yellow text-gray-800 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Any features you wish you had?
              </label>
              <textarea
                value={featureRequest}
                onChange={(e) => setFeatureRequest(e.target.value)}
                placeholder="e.g. inventory tracking, meeting notes..."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSkipSurvey}
                className="flex-1 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSurveySubmit}
                disabled={submitting || (!featureRequest.trim() && !usageFrequency)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg font-medium text-gray-700 transition-colors disabled:opacity-50"
              >
                <Send size={14} />
                {submitting ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  slides.push(
    <div>
      <h3 className="text-base font-bold text-gray-800 text-center mb-3">Updates</h3>
      <div className="space-y-3">
        {TEAM_UPDATES.map((update, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 mb-2">{update.date}</p>
            <ul className="space-y-1.5">
              {update.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-brand-yellow-dark shrink-0 mt-0.5">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )

  const totalSlides = slides.length
  const currentSlide = Math.min(slide, totalSlides - 1)
  const isLastSlide = currentSlide === totalSlides - 1

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Home
            </h1>
          </div>
          <NotificationBell />
        </div>
      </header>
      <main className="flex-1 p-4 pl-14 md:pl-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-8 pb-8">
          <div className="bg-gradient-to-r from-brand-blue/30 via-brand-yellow/30 to-brand-silver/30 rounded-2xl p-6 text-center">
            <img src={`${import.meta.env.BASE_URL}ScrumLogo-transparent.png`} alt="Scrum Logo" className="w-14 h-14 mx-auto mb-2 drop-shadow-lg" />
            <h2 className="text-2xl font-black text-gray-800">
              Welcome{teamNumber ? `, Team ${teamNumber}` : ''}!
            </h2>
            {teamName && <p className="text-base font-semibold text-gray-600">{teamName}</p>}
            <p className="text-sm text-gray-600 mt-1">
              This is your space — your boards, your people, your tasks. Nobody
              else can see them.
            </p>
          </div>
          <section>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Updates for Teams</h3>
            <div className="space-y-3">
              {TEAM_UPDATES.map((update, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs font-medium text-gray-400 mb-2">{update.date}</p>
                  <ul className="space-y-1.5">
                    {update.items.map((item, j) => (
                      <li key={j} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-brand-yellow-dark shrink-0 mt-0.5">-</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Slideshow popup overlay */}
      {showPopup && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[100]" onClick={hasSeenWelcome ? closePopup : undefined} />
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden relative">
              {/* Header */}
              <div className="px-4 py-3 flex items-center gap-2 bg-gradient-to-r from-brand-blue/30 via-brand-yellow/30 to-brand-silver/30">
                <img src={`${import.meta.env.BASE_URL}ScrumLogo-transparent.png`} alt="Logo" className="w-5 h-5" />
                <span className="text-sm font-semibold text-gray-700">Getting Started</span>
                {hasSeenWelcome && (
                  <button onClick={closePopup} className="p-1 rounded hover:bg-white/50 transition-colors ml-auto">
                    <X size={16} className="text-gray-500" />
                  </button>
                )}
              </div>

              {/* Slide content */}
              <div className="p-5 h-[60vh] overflow-y-auto">
                {slides[currentSlide]}
              </div>

              {/* Footer with arrows, dots, and button */}
              <div className="px-5 pb-4 pt-2 flex items-center gap-3">
                {/* Left arrow */}
                <button
                  onClick={() => setSlide(s => s - 1)}
                  disabled={currentSlide === 0}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-0"
                >
                  <ChevronLeft size={20} className="text-gray-500" />
                </button>

                {/* Dots */}
                <div className="flex-1 flex items-center justify-center gap-1.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      className={`rounded-full transition-all ${
                        i === currentSlide
                          ? 'w-5 h-2 bg-brand-yellow-dark'
                          : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>

                {/* Right arrow or finish button */}
                {isLastSlide ? (
                  <button
                    onClick={closePopup}
                    className="px-4 py-1.5 rounded-xl text-sm font-semibold text-gray-700 bg-brand-yellow hover:bg-brand-yellow-dark transition-colors"
                  >
                    Got it!
                  </button>
                ) : (
                  <button
                    onClick={() => setSlide(s => s + 1)}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight size={20} className="text-gray-500" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default TeamHomeView
