import { useState } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { lazyHeadersWith, restHeaders } from '../lib/restHeaders'
import { X, Megaphone, BarChart3, Plus, Minus } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { useToast } from './ToastProvider'
import { triggerPush } from '../utils/pushHelper'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

function AnnouncementModal({ onClose }) {
  const { username, user } = useUser()
  const { addToast } = useToast()

  const [step, setStep] = useState('choose') // 'choose' | 'message' | 'poll'
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pollType, setPollType] = useState('yes_no') // 'yes_no' | 'multiple_choice'
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [submitting, setSubmitting] = useState(false)

  const addOption = () => {
    if (pollOptions.length < 6) setPollOptions([...pollOptions, ''])
  }

  const removeOption = (index) => {
    if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== index))
  }

  const updateOption = (index, value) => {
    setPollOptions(pollOptions.map((opt, i) => i === index ? value : opt))
  }

  const notifyAll = async (announcement) => {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&authority_tier=neq.guest&select=id`,
        { headers: restHeaders() }
      )
      if (!res.ok) return
      const profiles = await res.json()

      for (const p of profiles) {
        if (p.id === user?.id) continue
        const notif = {
          id: String(Date.now()) + Math.random().toString(36).slice(2) + p.id.slice(0, 4),
          user_id: p.id,
          type: 'announcement',
          title: announcement.type === 'poll' ? `New Poll: ${announcement.title}` : `Announcement: ${announcement.title}`,
          body: announcement.type === 'poll' ? announcement.body : announcement.body.slice(0, 100),
        }
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers,
          body: JSON.stringify(notif),
        }).catch(() => {})
        triggerPush(notif)
      }
    } catch (err) {
      console.error('Failed to send announcement notifications:', err)
    }
  }

  const handleSubmitMessage = async () => {
    if (!title.trim() || !body.trim()) return
    setSubmitting(true)

    const announcement = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      author_id: user?.id,
      author_name: username,
      type: 'message',
      title: title.trim(),
      body: body.trim(),
      poll_type: null,
      poll_options: null,
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/announcements`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(announcement),
    })

    if (res.ok) {
      addToast('Announcement sent!', 'success')
      notifyAll(announcement)
      onClose()
    } else {
      addToast('Failed to send announcement.', 'error')
    }
    setSubmitting(false)
  }

  const handleSubmitPoll = async () => {
    if (!title.trim()) return
    const finalOptions = pollType === 'yes_no'
      ? ['Yes', 'No']
      : pollOptions.map(o => o.trim()).filter(Boolean)

    if (pollType === 'multiple_choice' && finalOptions.length < 2) {
      addToast('Add at least 2 options.', 'error')
      return
    }

    setSubmitting(true)

    const announcement = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      author_id: user?.id,
      author_name: username,
      type: 'poll',
      title: title.trim(),
      body: title.trim(),
      poll_type: pollType,
      poll_options: finalOptions,
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/announcements`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(announcement),
    })

    if (res.ok) {
      addToast('Poll created!', 'success')
      notifyAll(announcement)
      onClose()
    } else {
      addToast('Failed to create poll.', 'error')
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {step === 'choose' ? 'New Announcement' : step === 'message' ? 'Send Message' : 'Create Poll'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {step === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">What would you like to create?</p>
              <button
                onClick={() => setStep('message')}
                className="w-full flex items-center gap-3 p-4 border-2 border-gray-200 hover:border-brand-yellow rounded-xl transition-colors"
              >
                <Megaphone size={24} className="text-brand-yellow-dark" />
                <div className="text-left">
                  <div className="font-semibold text-gray-700">Message</div>
                  <div className="text-sm text-gray-500">Broadcast a message to the team</div>
                </div>
              </button>
              <button
                onClick={() => setStep('poll')}
                className="w-full flex items-center gap-3 p-4 border-2 border-gray-200 hover:border-brand-blue rounded-xl transition-colors"
              >
                <BarChart3 size={24} className="text-brand-blue-dark" />
                <div className="text-left">
                  <div className="font-semibold text-gray-700">Poll</div>
                  <div className="text-sm text-gray-500">Ask the team a question</div>
                </div>
              </button>
            </div>
          )}

          {step === 'message' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Announcement title"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message..."
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-yellow focus:border-transparent resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('choose')}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitMessage}
                  disabled={submitting || !title.trim() || !body.trim()}
                  className="flex-1 px-4 py-2 bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-semibold transition-colors"
                >
                  {submitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {step === 'poll' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What do you want to ask?"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Poll Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPollType('yes_no')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pollType === 'yes_no'
                        ? 'bg-brand-blue text-gray-800'
                        : 'border hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    Yes / No
                  </button>
                  <button
                    onClick={() => setPollType('multiple_choice')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pollType === 'multiple_choice'
                        ? 'bg-brand-blue text-gray-800'
                        : 'border hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    Multiple Choice
                  </button>
                </div>
              </div>

              {pollType === 'multiple_choice' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Options</label>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => removeOption(i)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <button
                      onClick={addOption}
                      className="flex items-center gap-1 text-sm text-brand-blue-dark hover:text-brand-blue px-2 py-1"
                    >
                      <Plus size={14} />
                      Add option
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('choose'); setPollType('yes_no'); setPollOptions(['', '']) }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitPoll}
                  disabled={submitting || !title.trim() || (pollType === 'multiple_choice' && pollOptions.filter(o => o.trim()).length < 2)}
                  className="flex-1 px-4 py-2 bg-brand-blue hover:bg-brand-blue-dark disabled:opacity-50 rounded-lg font-semibold transition-colors"
                >
                  {submitting ? 'Creating...' : 'Create Poll'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnnouncementModal
