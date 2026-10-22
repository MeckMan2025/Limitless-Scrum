import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Emoji per role — pick something that fits the job.
const ROLE_EMOJI = {
  'Co-Founder': '👑', 'Project Manager': '🚀', 'Mentor': '🎓', 'Coach': '🏆',
  'Business Lead': '💼', 'Technical Lead': '🛠️',
  'Co-Project Manager': '🚀', 'Co-Business Lead': '💼', 'Co-Technical Lead': '🛠️', 'Co-Programming Lead': '💻',
  'Communications': '📣', 'Finance': '💰', 'Outreach': '🌍',
  'CAD': '📐', 'Assembly/Building': '🔩', 'Wiring': '⚡', 'Programming': '💻', 'Scouting': '🔭',
  'Guest': '👋',
}

const TYPE_EMOJI = {
  role_change: '🎉', task_completed: '✅', task_assigned: '📋',
  task_request: '📥', role_request: '📥', announcement: '📣', quote_approved: '💬',
}

const parseData = (n) => {
  try { return typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {}) } catch { return {} }
}
const pickEmoji = (n) => {
  if (n?.type === 'role_change') {
    const d = parseData(n)
    if (d.role && ROLE_EMOJI[d.role]) return ROLE_EMOJI[d.role]
    return '🎉'
  }
  return TYPE_EMOJI[n?.type] || '🔔'
}

const CONFETTI_COLORS = ['#2F6FE4', '#F5C400', '#A9B2BF', '#8FB8FF', '#FFE27A', '#D9DEE6', '#c4b5fd', '#86efac']

// ── Looping CSS confetti (runs until unmounted) ──
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    key: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2.5 + Math.random() * 2.5,
    size: 6 + Math.random() * 8,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    round: Math.random() > 0.6,
    drift: (Math.random() * 2 - 1) * 40,
  })), [])
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-[101]">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-12vh) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(112vh) translateX(var(--drift)) rotate(720deg); opacity: 1; }
        }
      `}</style>
      {pieces.map(p => (
        <span
          key={p.key}
          style={{
            position: 'absolute', top: 0, left: `${p.left}%`,
            width: p.size, height: p.size * 0.6, background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            '--drift': `${p.drift}px`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// A notification popup. Role promotions get a full-screen celebration with
// confetti; everything else gets a small white card that auto-dismisses.
export default function NotificationPopup({ notification, onClose }) {
  const data = notification ? parseData(notification) : {}
  const isCelebration = notification?.type === 'role_change' && data.action === 'added'

  useEffect(() => {
    if (!notification || isCelebration) return // celebration stays until X
    const t = setTimeout(onClose, 7000)
    return () => clearTimeout(t)
  }, [notification, isCelebration, onClose])

  if (!notification) return null

  // ── Celebration modal ──
  if (isCelebration) {
    const role = data.role || 'team member'
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <style>{`
          @keyframes celebrate-pop {
            0%   { opacity: 0; transform: scale(.8); }
            60%  { opacity: 1; transform: scale(1.03); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <Confetti />
        <div className="relative z-[102] bg-white rounded-3xl shadow-2xl w-[92%] max-w-md min-h-[58vh] mx-auto flex flex-col items-center justify-center text-center px-8 py-12" style={{ animation: 'celebrate-pop .4s cubic-bezier(.2,.8,.2,1) both' }}>
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100" title="Dismiss">
            <X size={20} className="text-gray-400" />
          </button>
          <div className="text-8xl mb-6 drop-shadow-sm animate-bounce">{pickEmoji(notification)}</div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent mb-2">
            Congratulations!
          </h2>
          <p className="text-lg text-gray-600 font-medium">You are now a</p>
          <p className="text-2xl font-black text-gray-800 mt-1">{role}!</p>
          <button
            onClick={onClose}
            className="mt-8 px-8 py-3 rounded-full font-bold text-white shadow-lg hover:brightness-105 transition"
            style={{ background: 'linear-gradient(90deg, #2F6FE4, #F5C400, #A9B2BF)' }}
          >
            Let’s go! 🎉
          </button>
        </div>
      </div>,
      document.body
    )
  }

  // ── Small card (other notifications) ──
  return createPortal(
    <div className="fixed z-[100] top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 w-[calc(100%-2rem)] sm:w-80 animate-slide-in-right">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-start gap-3">
        <div className="text-3xl leading-none shrink-0 mt-0.5">{pickEmoji(notification)}</div>
        <div className="flex-1 min-w-0">
          {notification.title && <p className="text-sm font-bold text-gray-800 leading-snug">{notification.title}</p>}
          {notification.body && <p className="text-sm text-gray-500 leading-snug mt-0.5">{notification.body}</p>}
        </div>
        <button onClick={onClose} className="p-1 -mr-1 -mt-1 rounded-lg hover:bg-gray-100 shrink-0" title="Dismiss">
          <X size={16} className="text-gray-400" />
        </button>
      </div>
    </div>,
    document.body
  )
}
