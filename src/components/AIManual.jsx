import { useState } from 'react'
import { ExternalLink, RefreshCw, Bot, Loader2 } from 'lucide-react'

// FIRST's own chatbot for the Competition Manual. It answers rules questions
// out of the current manual, which is the thing people were opening a second
// tab for — so it lives in a tab here instead.
//
// It is embedded rather than rebuilt: the answers have to come from FIRST to be
// worth trusting in a match, and their page sets no frame restrictions. If that
// ever changes the iframe goes blank, so the "Open" link is always there rather
// than only appearing on an error we cannot reliably detect.
const CHATBOT_URL = 'https://ftc-cmchatbot.firstinspires.org/'

const EXAMPLES = [
  'How many artifacts can a robot control at once?',
  'What counts as a minor penalty?',
  'What are the robot size limits at inspection?',
]

export default function AIManual() {
  // Remounting the iframe is the only way to reset a conversation from out
  // here — the page keeps its own state and we cannot reach into it.
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = () => { setLoading(true); setReloadKey(k => k + 1) }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-5 gap-3">

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-yellow flex items-center justify-center shadow-sm shrink-0">
          <Bot size={20} className="text-gray-700" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-700 leading-tight">AI Manual</h2>
          <p className="text-xs text-gray-400 truncate">
            Ask FIRST&apos;s Competition Manual chatbot a rules question
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button
            onClick={reload}
            title="Start the conversation over"
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-white/80 border border-transparent hover:border-gray-100 transition-colors"
          >
            <RefreshCw size={15} />
          </button>
          <a
            href={CHATBOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open it in its own tab"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-blue hover:bg-brand-blue-dark transition-colors text-xs font-semibold text-gray-700 shadow-sm"
          >
            <ExternalLink size={13} /> Open
          </a>
        </div>
      </div>

      {/* Something to ask, for anyone who opens this not knowing what it does.
          They are not clickable — the chatbot owns its own input and we cannot
          reach into someone else's page to fill it in. */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
        {EXAMPLES.map(q => (
          <span
            key={q}
            className="shrink-0 px-3 py-1.5 rounded-full bg-white/70 border border-gray-100 text-[11px] text-gray-500 shadow-sm"
          >
            {q}
          </span>
        ))}
      </div>

      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border-2 border-gray-100 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A]">
            <Loader2 size={26} className="text-brand-blue-dark animate-spin" />
            <p className="text-xs font-semibold text-gray-500">Waking up the manual…</p>
          </div>
        )}
        <iframe
          key={reloadKey}
          src={CHATBOT_URL}
          title="FRC Competition Manual chatbot"
          onLoad={() => setLoading(false)}
          className="w-full h-full border-0 block"
          // It is someone else's page: let it run and talk to its own servers,
          // and nothing else.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      </div>

      <p className="text-[11px] text-gray-400 text-center px-2">
        Answers come from FIRST, not from us — check the rule it quotes before you take it to a ref.
      </p>
    </div>
  )
}
