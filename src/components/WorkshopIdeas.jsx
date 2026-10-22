import { useState, useEffect, useMemo, useRef } from 'react'
import { onlyMyTeam, stampTeam, teamScope } from '../lib/teamScope'
import { lazyHeadersWith, lazyRestHeaders } from '../lib/restHeaders'
import {
  Plus, Send, Trash2, Check, X, ChevronRight, ChevronLeft, Eye,
  Lightbulb, Monitor, Video, ListOrdered, Upload, Link, MessageSquare,
  Clock, Users, Target, BookOpen, Edit3, RotateCcw, FileText, Library,
  ImagePlus, Loader2, ArrowLeft, CheckCircle2, Circle, ArrowRight, Trophy,
  Image, Camera, Save, PlayCircle
} from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import NotificationBell from './NotificationBell'
import { uploadImageFile } from '../lib/photos'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyRestHeaders
const jsonHeaders = lazyHeadersWith({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })
const CATEGORIES = ['CAD', 'Programming', 'AI', 'Business', 'Other']
const FORMATS = [
  { id: 'live', label: 'Live Presentation', icon: Monitor, desc: 'Present live to teammates' },
  { id: 'video', label: 'Pre-recorded Video', icon: Video, desc: 'Upload or link a video' },
  { id: 'guide', label: 'Guided Step-by-Step', icon: ListOrdered, desc: 'Written step-by-step guide' },
]

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  needs_revision: 'bg-yellow-100 text-yellow-700',
  denied: 'bg-red-100 text-red-600',
}
const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  needs_revision: 'Needs Revision',
  denied: 'Denied',
}

const DURATION_OPTIONS = ['15 min', '30 min', '45 min', '1 hour', '1.5 hours', '2 hours', '2+ hours']

function formatDate(ts) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Create Workshop Modal ───────────────────────────────────────────────────

function CreateWorkshopModal({ onClose, onSave, editing }) {
  const [step, setStep] = useState(editing ? 2 : 1)
  const [format, setFormat] = useState(editing?.format_type || '')
  const [form, setForm] = useState({
    title: editing?.title || '',
    category: editing?.category || '',
    target_audience: editing?.target_audience || '',
    objective: editing?.objective || '',
    duration: editing?.duration || '',
    ...(editing?.content_data || {}),
  })
  const [errors, setErrors] = useState({})

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  // Normalize steps: support old string[] format and new {text, image}[] format
  const normalizeSteps = (raw) => {
    if (!raw || !Array.isArray(raw)) return [{ text: '', image: '' }, { text: '', image: '' }, { text: '', image: '' }]
    return raw.map(s => typeof s === 'string' ? { text: s, image: '' } : { text: s.text || '', image: s.image || '' })
  }

  const contentData = () => {
    const d = {}
    if (format === 'live') {
      d.slides_link = form.slides_link || ''
      d.materials = form.materials || ''
      d.location = form.location || ''
    } else if (format === 'video') {
      d.video_link = form.video_link || ''
      d.materials = form.materials || ''
    } else if (format === 'guide') {
      d.steps = normalizeSteps(form.steps)
      d.expected_outcome = form.expected_outcome || ''
    }
    return d
  }

  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = true
    if (!form.category) e.category = true
    if (!form.target_audience.trim()) e.target_audience = true
    if (!form.objective.trim()) e.objective = true
    if (!form.duration) e.duration = true
    if (format === 'guide') {
      const steps = normalizeSteps(form.steps)
      if (!steps[0]?.text?.trim()) e.steps = true
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = (status) => {
    if (!validate()) return
    onSave({
      title: form.title.trim(),
      category: form.category,
      format_type: format,
      objective: form.objective.trim(),
      target_audience: form.target_audience.trim(),
      duration: form.duration,
      content_data: contentData(),
      status,
    })
  }

  const steps = normalizeSteps(form.steps)
  const [uploadingStep, setUploadingStep] = useState(null)

  const setStepText = (idx, val) => {
    const newSteps = [...steps]
    newSteps[idx] = { ...newSteps[idx], text: val }
    set('steps', newSteps)
  }
  const setStepImage = (idx, url) => {
    const newSteps = [...steps]
    newSteps[idx] = { ...newSteps[idx], image: url }
    set('steps', newSteps)
  }
  const addStep = () => set('steps', [...steps, { text: '', image: '' }])
  const removeStep = (idx) => {
    if (steps.length <= 1) return
    set('steps', steps.filter((_, i) => i !== idx))
  }

  const handleStepImageUpload = async (idx, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingStep(idx)
    try {
      setStepImage(idx, await uploadImageFile(supabaseUrl, supabaseKey, 'workshop-steps', file))
    } catch (err) {
      console.error('Step image upload error:', err)
    }
    setUploadingStep(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            {editing ? 'Edit Workshop' : 'Create Workshop'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Step 1: Choose Format */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-600">Choose a format</p>
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setFormat(f.id); setStep(2) }}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    format === f.id
                      ? 'border-brand-yellow bg-brand-yellow/10'
                      : 'border-gray-100 hover:border-brand-blue/50 hover:bg-gray-50'
                  }`}
                >
                  <f.icon size={22} className="text-brand-blue-dark shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-700 text-sm">{f.label}</p>
                    <p className="text-xs text-gray-400">{f.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Fill Details */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Back button */}
              {!editing && (
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft size={14} />
                  Change format
                </button>
              )}

              {/* Format badge */}
              <div className="flex items-center gap-2">
                {(() => { const F = FORMATS.find(f => f.id === format); return F ? <F.icon size={16} className="text-brand-blue-dark" /> : null })()}
                <span className="text-sm font-medium text-brand-blue-dark">
                  {FORMATS.find(f => f.id === format)?.label}
                </span>
              </div>

              {/* ChatGPT helper */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                <p className="font-semibold mb-1">Need help planning your workshop?</p>
                <p className="text-blue-600 text-xs">
                  Paste{' '}
                  <a
                    href="https://chatgpt.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium hover:text-blue-800"
                  >this prompt into ChatGPT</a>{' '}
                  and it will help you build out your steps, objectives, and materials:
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium text-blue-700 hover:text-blue-900 text-xs">
                    Click to see the prompt
                  </summary>
                  <div className="mt-2 bg-white border border-blue-100 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap select-all">
{`I'm creating a ${FORMATS.find(f => f.id === format)?.label || 'workshop'} for my robotics team. Help me plan it out by asking me questions about:

1. What topic I want to teach
2. Who my audience is and their skill level
3. What I want them to learn by the end

Then based on my answers, generate:
- A clear title
- A 1-2 sentence learning objective
- The target audience description
- Estimated duration
- ${format === 'guide' ? 'A step-by-step guide with detailed instructions for each step' : format === 'live' ? 'An outline for my presentation slides and a list of materials needed' : 'An outline for my video and any materials viewers will need'}

Keep it concise and practical. Ask me one question at a time.`}
                  </div>
                </details>
              </div>

              {/* Common Fields */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title *</label>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Intro to 3D Printing"
                  className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent ${errors.title ? 'border-red-300' : ''}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category *</label>
                  <select
                    value={form.category}
                    onChange={e => set('category', e.target.value)}
                    className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent ${errors.category ? 'border-red-300' : ''}`}
                  >
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration *</label>
                  <select
                    value={form.duration}
                    onChange={e => set('duration', e.target.value)}
                    className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent ${errors.duration ? 'border-red-300' : ''}`}
                  >
                    <option value="">Select...</option>
                    {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target Audience *</label>
                <input
                  value={form.target_audience}
                  onChange={e => set('target_audience', e.target.value)}
                  placeholder="e.g. Beginners, CAD team, Everyone"
                  className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent ${errors.target_audience ? 'border-red-300' : ''}`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Learning Objective *</label>
                <textarea
                  value={form.objective}
                  onChange={e => set('objective', e.target.value)}
                  placeholder="What will participants learn? (1-2 sentences)"
                  rows={2}
                  className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent resize-none ${errors.objective ? 'border-red-300' : ''}`}
                />
              </div>

              {/* Format-Specific Fields */}
              {format === 'live' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slides Link (optional)</label>
                    <input
                      value={form.slides_link || ''}
                      onChange={e => set('slides_link', e.target.value)}
                      placeholder="Google Slides, PowerPoint link..."
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Materials Needed</label>
                    <input
                      value={form.materials || ''}
                      onChange={e => set('materials', e.target.value)}
                      placeholder="e.g. Laptop, 3D printer access..."
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location (optional)</label>
                    <input
                      value={form.location || ''}
                      onChange={e => set('location', e.target.value)}
                      placeholder="e.g. Room 204, Workshop Area"
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {format === 'video' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Video Link *</label>
                    <input
                      value={form.video_link || ''}
                      onChange={e => set('video_link', e.target.value)}
                      placeholder="YouTube, Google Drive, or other video link"
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Materials Needed (optional)</label>
                    <input
                      value={form.materials || ''}
                      onChange={e => set('materials', e.target.value)}
                      placeholder="e.g. Follow-along files, software..."
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {format === 'guide' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Steps *</label>
                    <div className="mt-1 space-y-3">
                      {steps.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-xs font-bold text-brand-blue-dark mt-2.5 w-5 text-right shrink-0">{i + 1}.</span>
                          <div className="flex-1 space-y-1.5">
                            <textarea
                              value={s.text}
                              onChange={e => setStepText(i, e.target.value)}
                              placeholder={`Step ${i + 1}...`}
                              rows={2}
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent resize-none ${i === 0 && errors.steps ? 'border-red-300' : ''}`}
                            />
                            {s.image ? (
                              <div className="relative inline-block">
                                <img src={s.image} alt={`Step ${i + 1}`} className="h-20 rounded-lg object-cover" />
                                <button
                                  onClick={() => setStepImage(i, '')}
                                  className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5 text-gray-400 hover:text-red-500"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xs cursor-pointer transition-colors">
                                {uploadingStep === i ? (
                                  <><Loader2 size={12} className="animate-spin" /> Uploading...</>
                                ) : (
                                  <><ImagePlus size={12} /> Add photo</>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={e => handleStepImageUpload(i, e)}
                                  disabled={uploadingStep !== null}
                                />
                              </label>
                            )}
                          </div>
                          {steps.length > 1 && (
                            <button onClick={() => removeStep(i)} className="mt-2 text-gray-300 hover:text-red-400">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={addStep}
                      className="mt-2 flex items-center gap-1 text-xs text-brand-blue-dark hover:text-brand-yellow-dark font-medium"
                    >
                      <Plus size={12} />
                      Add Step
                    </button>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expected Outcome</label>
                    <textarea
                      value={form.expected_outcome || ''}
                      onChange={e => set('expected_outcome', e.target.value)}
                      placeholder="What should the participant have at the end?"
                      rows={2}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent resize-none"
                    />
                  </div>
                </>
              )}

              {Object.keys(errors).length > 0 && (
                <p className="text-xs text-red-500">Please fill in all required fields.</p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handleSave('draft')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold text-gray-600 transition-colors"
                >
                  <FileText size={14} />
                  Save Draft
                </button>
                <button
                  onClick={() => handleSave('submitted')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-yellow hover:bg-brand-yellow-dark rounded-xl text-sm font-semibold text-gray-700 transition-colors"
                >
                  <Send size={14} />
                  Submit for Review
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Workshop Detail / View Modal ────────────────────────────────────────────

function WorkshopDetailModal({ workshop, onClose, canReview, onReview }) {
  const [reviewAction, setReviewAction] = useState(null) // 'approve' | 'revision' | 'deny'
  const [reviewComment, setReviewComment] = useState('')

  const cd = workshop.content_data || {}
  const fmt = FORMATS.find(f => f.id === workshop.format_type)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {fmt && <fmt.icon size={18} className="text-brand-blue-dark shrink-0" />}
            <h2 className="text-lg font-bold text-gray-800 truncate">{workshop.title}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[workshop.status]}`}>
              {STATUS_LABELS[workshop.status]}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-blue/30 text-brand-blue-dark font-medium">
              {workshop.category}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
              <Clock size={10} /> {workshop.duration}
            </span>
          </div>

          <div className="text-xs text-gray-400">
            By <span className="font-medium text-gray-600">{workshop.creator_name}</span> &middot; {formatDate(workshop.created_at)}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Learning Objective</p>
            <p className="text-sm text-gray-700">{workshop.objective}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Target Audience</p>
            <p className="text-sm text-gray-700">{workshop.target_audience}</p>
          </div>

          {/* Format-specific content */}
          {workshop.format_type === 'live' && (
            <>
              {cd.slides_link && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Slides</p>
                  <a href={cd.slides_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline break-all">
                    {cd.slides_link}
                  </a>
                </div>
              )}
              {cd.materials && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Materials Needed</p>
                  <p className="text-sm text-gray-700">{cd.materials}</p>
                </div>
              )}
              {cd.location && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</p>
                  <p className="text-sm text-gray-700">{cd.location}</p>
                </div>
              )}
            </>
          )}

          {workshop.format_type === 'video' && (
            <>
              {cd.video_link && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Video</p>
                  <a href={cd.video_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline break-all">
                    {cd.video_link}
                  </a>
                </div>
              )}
              {cd.materials && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Materials Needed</p>
                  <p className="text-sm text-gray-700">{cd.materials}</p>
                </div>
              )}
            </>
          )}

          {workshop.format_type === 'guide' && (
            <>
              {cd.steps && cd.steps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Steps</p>
                  <div className="space-y-3">
                    {cd.steps
                      .map(s => typeof s === 'string' ? { text: s, image: '' } : s)
                      .filter(s => s.text?.trim())
                      .map((s, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex gap-2">
                          <span className="text-xs font-bold text-brand-blue-dark mt-0.5 w-5 text-right shrink-0">{i + 1}.</span>
                          <p className="text-sm text-gray-700">{s.text}</p>
                        </div>
                        {s.image && (
                          <img src={s.image} alt={`Step ${i + 1}`} className="ml-7 rounded-lg max-h-48 object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cd.expected_outcome && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Outcome</p>
                  <p className="text-sm text-gray-700">{cd.expected_outcome}</p>
                </div>
              )}
            </>
          )}

          {/* Review comment from reviewer */}
          {workshop.review_comment && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-yellow-700 mb-1">Reviewer Feedback</p>
              <p className="text-sm text-yellow-800">{workshop.review_comment}</p>
              {workshop.reviewer_name && (
                <p className="text-xs text-yellow-600 mt-1">— {workshop.reviewer_name}</p>
              )}
            </div>
          )}

          {/* Review Controls (Top users only, when status is submitted) */}
          {canReview && workshop.status === 'submitted' && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Review</p>
              {!reviewAction ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => onReview(workshop.id, 'approved', '')}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 hover:bg-green-100 text-green-600 text-sm font-medium transition-colors"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={() => setReviewAction('revision')}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-sm font-medium transition-colors"
                  >
                    <MessageSquare size={14} /> Request Revision
                  </button>
                  <button
                    onClick={() => setReviewAction('deny')}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium transition-colors"
                  >
                    <X size={14} /> Deny
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    placeholder={reviewAction === 'revision' ? 'What needs to be changed?' : 'Reason for denial (optional)'}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReviewAction(null)}
                      className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const status = reviewAction === 'revision' ? 'needs_revision' : 'denied'
                        onReview(workshop.id, status, reviewComment)
                      }}
                      disabled={reviewAction === 'revision' && !reviewComment.trim()}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                        reviewAction === 'deny'
                          ? 'bg-red-100 hover:bg-red-200 text-red-600'
                          : 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700'
                      }`}
                    >
                      {reviewAction === 'deny' ? 'Confirm Deny' : 'Request Revision'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Full-Screen Workshop Viewer ─────────────────────────────────────────────

function WorkshopViewer({ workshop, onClose, userId, username, onComplete, onSave }) {
  const cd = workshop.content_data || {}
  const fmt = FORMATS.find(f => f.id === workshop.format_type)

  // For guide format: step progress with localStorage persistence
  const storageKey = `workshop-progress-${userId}-${workshop.id}`
  const rawSteps = (cd.steps || []).map(s => typeof s === 'string' ? { text: s, image: '' } : s).filter(s => s.text?.trim())
  const totalSteps = rawSteps.length

  const [completedSteps, setCompletedSteps] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || [] } catch { return [] }
  })
  const [currentStep, setCurrentStep] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey)) || []
      const firstIncomplete = rawSteps.findIndex((_, i) => !saved.includes(i))
      return firstIncomplete === -1 ? 0 : firstIncomplete
    } catch { return 0 }
  })
  const [showFinish, setShowFinish] = useState(false)
  const [finishPhoto, setFinishPhoto] = useState(null)
  const [finishPreview, setFinishPreview] = useState(null)
  const [finishUploading, setFinishUploading] = useState(false)

  const stepRefs = useRef([])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(completedSteps))
  }, [completedSteps, storageKey])

  const toggleStep = (idx) => {
    setCompletedSteps(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  const goToStep = (idx) => {
    setCurrentStep(idx)
    stepRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const nextStep = () => {
    if (currentStep < totalSteps - 1) goToStep(currentStep + 1)
  }
  const prevStep = () => {
    if (currentStep > 0) goToStep(currentStep - 1)
  }

  const markAndNext = () => {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep])
    }
    if (currentStep < totalSteps - 1) {
      goToStep(currentStep + 1)
    } else {
      // Last step marked — show finish screen
      setShowFinish(true)
    }
  }

  const handleFinish = async () => {
    let photoUrl = null
    if (finishPhoto) {
      setFinishUploading(true)
      try {
        photoUrl = await uploadImageFile(supabaseUrl, supabaseKey, 'workshop-gallery', finishPhoto)
      } catch (err) {
        console.error('Finish photo upload error:', err)
      }
      setFinishUploading(false)
    }
    // Save completion
    onComplete(workshop, photoUrl)
    // Clear step progress from localStorage
    localStorage.removeItem(storageKey)
    onClose()
  }

  const handleSkipFinish = () => {
    onComplete(workshop, null)
    localStorage.removeItem(storageKey)
    onClose()
  }

  const allComplete = totalSteps > 0 && completedSteps.length >= totalSteps
  const isGuide = workshop.format_type === 'guide' && totalSteps > 0

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {fmt && <fmt.icon size={16} className="text-brand-blue-dark shrink-0" />}
            <h1 className="text-base font-bold text-gray-800 truncate">{workshop.title}</h1>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{workshop.creator_name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/20 text-brand-blue-dark font-medium">{workshop.category}</span>
            <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock size={10} /> {workshop.duration}</span>
          </div>
        </div>
      </div>

      {/* Progress bar for guides */}
      {isGuide && (
        <div className="bg-gray-50 border-b px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-gray-500">
              {completedSteps.length}/{totalSteps} steps complete
            </span>
            {allComplete && <Trophy size={14} className="text-yellow-500" />}
          </div>
          <div className="flex gap-1">
            {rawSteps.map((_, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  completedSteps.includes(i)
                    ? 'bg-green-400'
                    : i === currentStep
                    ? 'bg-brand-yellow-dark'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Objective */}
          <div className="bg-brand-blue/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-brand-blue-dark uppercase tracking-wide mb-1">Learning Objective</p>
            <p className="text-sm text-gray-700">{workshop.objective}</p>
          </div>

          {/* Live presentation content */}
          {workshop.format_type === 'live' && (
            <div className="space-y-4">
              {cd.slides_link && (
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Slides</p>
                  <a href={cd.slides_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline break-all">{cd.slides_link}</a>
                </div>
              )}
              {cd.materials && (
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Materials Needed</p>
                  <p className="text-sm text-gray-700">{cd.materials}</p>
                </div>
              )}
              {cd.location && (
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</p>
                  <p className="text-sm text-gray-700">{cd.location}</p>
                </div>
              )}
            </div>
          )}

          {/* Video content */}
          {workshop.format_type === 'video' && (
            <div className="space-y-4">
              {cd.video_link && (
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Video</p>
                  <a href={cd.video_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline break-all">{cd.video_link}</a>
                </div>
              )}
              {cd.materials && (
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Materials Needed</p>
                  <p className="text-sm text-gray-700">{cd.materials}</p>
                </div>
              )}
            </div>
          )}

          {/* Guide steps */}
          {isGuide && (
            <div className="space-y-4">
              {rawSteps.map((step, i) => (
                <div
                  key={i}
                  ref={el => stepRefs.current[i] = el}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    i === currentStep
                      ? 'border-brand-yellow shadow-md'
                      : completedSteps.includes(i)
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleStep(i)}
                      className="mt-0.5 shrink-0"
                    >
                      {completedSteps.includes(i) ? (
                        <CheckCircle2 size={22} className="text-green-500" />
                      ) : (
                        <Circle size={22} className="text-gray-300 hover:text-brand-yellow" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-brand-blue-dark mb-1">Step {i + 1}</p>
                      <p className={`text-sm ${completedSteps.includes(i) ? 'text-gray-500' : 'text-gray-700'}`}>
                        {step.text}
                      </p>
                      {step.image && (
                        <img src={step.image} alt={`Step ${i + 1}`} className="mt-3 rounded-lg max-w-full max-h-64 object-cover" />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Expected outcome */}
              {cd.expected_outcome && (
                <div className={`rounded-xl border-2 p-4 ${allComplete ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Outcome</p>
                  <p className="text-sm text-gray-700">{cd.expected_outcome}</p>
                </div>
              )}

              {/* Finish screen */}
              {showFinish && (
                <div className="text-center py-6 space-y-4">
                  <Trophy size={48} className="mx-auto text-yellow-500" />
                  <div>
                    <p className="text-lg font-bold text-gray-800">Workshop Complete!</p>
                    <p className="text-sm text-gray-500 mt-1">Great job finishing all {totalSteps} steps.</p>
                  </div>

                  {/* Optional photo */}
                  <div className="max-w-xs mx-auto space-y-3">
                    <p className="text-sm font-medium text-gray-600">Take a photo of what you made (optional)</p>
                    {finishPreview ? (
                      <div className="relative inline-block">
                        <img src={finishPreview} alt="Your work" className="h-40 rounded-xl object-cover" />
                        <button
                          onClick={() => { setFinishPhoto(null); setFinishPreview(null) }}
                          className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5 text-gray-400 hover:text-red-500"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-yellow cursor-pointer transition-colors">
                        <Camera size={24} className="text-gray-400" />
                        <span className="text-sm text-gray-400">Upload photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) {
                              setFinishPhoto(file)
                              setFinishPreview(URL.createObjectURL(file))
                            }
                          }}
                        />
                      </label>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleSkipFinish}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-600 transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={handleFinish}
                        disabled={finishUploading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark text-sm font-semibold text-gray-700 transition-colors disabled:opacity-40"
                      >
                        {finishUploading ? (
                          <><Loader2 size={14} className="animate-spin" /> Saving...</>
                        ) : (
                          <><Check size={14} /> Finish</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Done button for non-guide workshops */}
      {!isGuide && (
        <div className="bg-white border-t px-4 py-3 shrink-0">
          <button
            onClick={() => { onComplete(workshop, null); onClose() }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark text-sm font-semibold text-gray-700 transition-colors"
          >
            <Check size={16} /> Done
          </button>
        </div>
      )}

      {/* Bottom navigation for guides */}
      {isGuide && !showFinish && (
        <div className="bg-white border-t px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm font-medium text-gray-600 transition-colors"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <button
            onClick={markAndNext}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              completedSteps.includes(currentStep)
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-brand-yellow hover:bg-brand-yellow-dark text-gray-700'
            }`}
          >
            {completedSteps.includes(currentStep) ? (
              currentStep < totalSteps - 1 ? <><Check size={16} /> Next</> : <><Check size={16} /> Completed</>
            ) : (
              currentStep < totalSteps - 1 ? <><CheckCircle2 size={16} /> Complete & Next</> : <><CheckCircle2 size={16} /> Complete</>
            )}
          </button>
          <button
            onClick={() => { onSave ? onSave() : onClose() }}
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-600 transition-colors"
          >
            <Save size={16} /> Save
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Workshop Card ───────────────────────────────────────────────────────────

function WorkshopCard({ workshop, onClick, showStatus, showActions, onDelete, onWithdraw, onEdit, onSubmit, onAdminDelete, onAdminEdit }) {
  const fmt = FORMATS.find(f => f.id === workshop.format_type)

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {fmt && <fmt.icon size={14} className="text-brand-blue-dark shrink-0" />}
            <h3 className="text-sm font-semibold text-gray-800 truncate">{workshop.title}</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">{workshop.creator_name}</span>
            <span className="text-xs text-gray-300">&middot;</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/20 text-brand-blue-dark font-medium">
              {workshop.category}
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-0.5">
              <Clock size={10} /> {workshop.duration}
            </span>
          </div>
        </div>
        {showStatus && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[workshop.status]}`}>
            {STATUS_LABELS[workshop.status]}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{workshop.objective}</p>

      {/* Action buttons for own workshops */}
      {showActions && (
        <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
          {workshop.status === 'draft' && (
            <>
              <button
                onClick={() => onEdit(workshop)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium transition-colors"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                onClick={() => onSubmit(workshop)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-yellow/50 hover:bg-brand-yellow text-gray-700 text-xs font-medium transition-colors"
              >
                <Send size={12} /> Submit
              </button>
              <button
                onClick={() => onDelete(workshop.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-medium transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
          {workshop.status === 'submitted' && (
            <button
              onClick={() => onWithdraw(workshop.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium transition-colors"
            >
              <RotateCcw size={12} /> Withdraw
            </button>
          )}
          {workshop.status === 'needs_revision' && (
            <button
              onClick={() => onEdit(workshop)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-xs font-medium transition-colors"
            >
              <Edit3 size={12} /> Revise & Resubmit
            </button>
          )}
        </div>
      )}

      {/* Admin controls (leads only) */}
      {(onAdminEdit || onAdminDelete) && (
        <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
          {onAdminEdit && (
            <button
              onClick={() => onAdminEdit(workshop)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium transition-colors"
            >
              <Edit3 size={12} /> Edit
            </button>
          )}
          {onAdminDelete && (
            <button
              onClick={() => onAdminDelete(workshop.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-medium transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WorkshopIdeas() {
  const { username, user } = useUser()
  const { hasLeadTag, isGuest, myTeamNumber} = usePermissions()

  const SCOPE = teamScope(myTeamNumber)
  const canReview = hasLeadTag
  const canCreate = !isGuest

  const [workshops, setWorkshops] = useState([])
  const [section, setSection] = useState('library') // 'library' | 'my' | 'review' | 'gallery'
  const [createModal, setCreateModal] = useState(false)
  const [editingWorkshop, setEditingWorkshop] = useState(null)
  const [viewWorkshop, setViewWorkshop] = useState(null) // detail modal (my/review)
  const [activeWorkshop, setActiveWorkshop] = useState(null) // full-screen viewer (library)
  const [myFilter, setMyFilter] = useState('all')
  const [galleryItems, setGalleryItems] = useState([])
  const [completions, setCompletions] = useState([])
  const [progressTick, setProgressTick] = useState(0)

  const loadWorkshops = async () => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/workshops?${SCOPE}&select=*&order=created_at.desc`, { headers })
      if (res.ok) setWorkshops(await res.json())
    } catch (err) {
      console.error('Failed to load workshops:', err)
    }
  }

  const loadGallery = async () => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/workshop_gallery?${SCOPE}&select=*&order=created_at.desc`, { headers })
      if (res.ok) setGalleryItems(await res.json())
    } catch (err) {
      console.error('Failed to load gallery:', err)
    }
  }

  const loadCompletions = async () => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/workshop_completions?${SCOPE}&select=*&order=completed_at.desc`, { headers })
      if (res.ok) setCompletions(await res.json())
    } catch (err) {
      console.error('Failed to load completions:', err)
    }
  }

  useEffect(() => {
    loadWorkshops()
    loadGallery()
    loadCompletions()
    const onFocus = () => { loadWorkshops(); loadGallery(); loadCompletions() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('workshops-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workshops' }, onlyMyTeam((payload) => {
        setWorkshops(prev => prev.some(w => w.id === payload.new.id) ? prev : [payload.new, ...prev])
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workshops' }, onlyMyTeam((payload) => {
        setWorkshops(prev => prev.some(w => w.id === payload.new.id)
          ? prev.map(w => w.id === payload.new.id ? payload.new : w)
          : [payload.new, ...prev]
        )
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'workshops' }, onlyMyTeam((payload) => {
        setWorkshops(prev => prev.filter(w => w.id !== payload.old.id))
      }))
      .subscribe()

    const galleryChannel = supabase
      .channel('workshop-gallery-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workshop_gallery' }, onlyMyTeam((payload) => {
        setGalleryItems(prev => prev.some(g => g.id === payload.new.id) ? prev : [payload.new, ...prev])
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'workshop_gallery' }, onlyMyTeam((payload) => {
        setGalleryItems(prev => prev.filter(g => g.id !== payload.old.id))
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(galleryChannel) }
  }, [])

  // Derived lists
  const myWorkshops = useMemo(() =>
    workshops.filter(w =>
      w.creator_name === username ||
      (user?.email && w.creator_name === user.email) ||
      (username && w.creator_name?.toLowerCase() === username.toLowerCase())
    ),
  [workshops, username, user])

  const filteredMyWorkshops = useMemo(() =>
    myFilter === 'all' ? myWorkshops : myWorkshops.filter(w => w.status === myFilter),
  [myWorkshops, myFilter])

  const libraryWorkshops = useMemo(() =>
    workshops.filter(w => w.status === 'approved'),
  [workshops])

  const reviewQueue = useMemo(() =>
    workshops.filter(w => w.status === 'submitted'),
  [workshops])

  // Handlers
  const handleSave = async (data) => {
    const workshop = {
      id: editingWorkshop?.id || String(Date.now()) + Math.random().toString(36).slice(2),
      creator_name: username || user?.email || 'Anonymous',
      ...data,
      review_comment: editingWorkshop?.review_comment || null,
      reviewer_name: editingWorkshop?.reviewer_name || null,
      created_at: editingWorkshop?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (editingWorkshop) {
      // Update
      setWorkshops(prev => prev.map(w => w.id === editingWorkshop.id ? { ...w, ...workshop } : w))
      try {
        await fetch(`${supabaseUrl}/rest/v1/workshops?id=eq.${editingWorkshop.id}`, {
          method: 'PATCH',
          headers: jsonHeaders,
          body: JSON.stringify({
            title: workshop.title,
            category: workshop.category,
            format_type: workshop.format_type,
            objective: workshop.objective,
            target_audience: workshop.target_audience,
            duration: workshop.duration,
            content_data: workshop.content_data,
            status: workshop.status,
            review_comment: data.status === 'submitted' ? null : workshop.review_comment,
            reviewer_name: data.status === 'submitted' ? null : workshop.reviewer_name,
            updated_at: workshop.updated_at,
          }),
        })
      } catch (err) {
        console.error('Failed to update workshop:', err)
        loadWorkshops()
      }
    } else {
      // Insert
      setWorkshops(prev => [workshop, ...prev])
      try {
        await fetch(`${supabaseUrl}/rest/v1/workshops`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify(workshop),
        })
      } catch (err) {
        console.error('Failed to create workshop:', err)
        setWorkshops(prev => prev.filter(w => w.id !== workshop.id))
      }
    }

    setCreateModal(false)
    setEditingWorkshop(null)
    setSection('my')
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this workshop draft?')) return
    setWorkshops(prev => prev.filter(w => w.id !== id))
    try {
      await fetch(`${supabaseUrl}/rest/v1/workshops?id=eq.${id}`, { method: 'DELETE', headers })
    } catch (err) {
      console.error('Failed to delete workshop:', err)
      loadWorkshops()
    }
  }

  const handleWithdraw = async (id) => {
    if (!window.confirm('Withdraw this submission? It will return to draft.')) return
    setWorkshops(prev => prev.map(w => w.id === id ? { ...w, status: 'draft' } : w))
    try {
      await fetch(`${supabaseUrl}/rest/v1/workshops?id=eq.${id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'draft', updated_at: new Date().toISOString() }),
      })
    } catch (err) {
      console.error('Failed to withdraw workshop:', err)
      loadWorkshops()
    }
  }

  const handleSubmit = async (workshop) => {
    setWorkshops(prev => prev.map(w => w.id === workshop.id ? { ...w, status: 'submitted' } : w))
    try {
      await fetch(`${supabaseUrl}/rest/v1/workshops?id=eq.${workshop.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'submitted', review_comment: null, reviewer_name: null, updated_at: new Date().toISOString() }),
      })
    } catch (err) {
      console.error('Failed to submit workshop:', err)
      loadWorkshops()
    }
  }

  const handleReview = async (id, status, comment) => {
    setWorkshops(prev => prev.map(w => w.id === id ? { ...w, status, review_comment: comment || null, reviewer_name: username } : w))
    setViewWorkshop(null)
    try {
      await fetch(`${supabaseUrl}/rest/v1/workshops?id=eq.${id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status, review_comment: comment || null, reviewer_name: username, updated_at: new Date().toISOString() }),
      })
    } catch (err) {
      console.error('Failed to review workshop:', err)
      loadWorkshops()
    }
  }

  const handleEdit = (workshop) => {
    setEditingWorkshop(workshop)
    setCreateModal(true)
  }

  const handleAdminDelete = async (id) => {
    if (!window.confirm('Delete this workshop? This cannot be undone.')) return
    setWorkshops(prev => prev.filter(w => w.id !== id))
    try {
      await fetch(`${supabaseUrl}/rest/v1/workshops?id=eq.${id}`, { method: 'DELETE', headers })
    } catch (err) {
      console.error('Failed to delete workshop:', err)
      loadWorkshops()
    }
  }

  const handleWorkshopComplete = async (workshop, photoUrl) => {
    const completion = stampTeam({
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      workshop_id: workshop.id,
      workshop_title: workshop.title,
      completed_by: username,
      photo_url: photoUrl || null,
      completed_at: new Date().toISOString(),
    }, myTeamNumber)
    setCompletions(prev => [completion, ...prev])
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/workshop_completions`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(completion),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      // Don't let it look saved when it isn't: it would vanish on reload.
      console.error('Failed to save completion:', err)
      setCompletions(prev => prev.filter(c => c.id !== completion.id))
      window.alert("Couldn't save that workshop as completed. Please try again.")
    }
    // Also add to gallery if photo was provided
    if (photoUrl) {
      const galleryItem = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        image_url: photoUrl,
        caption: '',
        workshop_id: workshop.id,
        workshop_title: workshop.title,
        submitted_by: username,
        created_at: new Date().toISOString(),
      }
      setGalleryItems(prev => [galleryItem, ...prev])
      try {
        await fetch(`${supabaseUrl}/rest/v1/workshop_gallery`, {
          method: 'POST', headers: jsonHeaders, body: JSON.stringify(galleryItem),
        })
      } catch (err) {
        console.error('Failed to save gallery item:', err)
      }
    }
  }

  const handleGalleryDelete = async (id) => {
    if (!window.confirm('Delete this gallery submission?')) return
    setGalleryItems(prev => prev.filter(g => g.id !== id))
    try {
      await fetch(`${supabaseUrl}/rest/v1/workshop_gallery?id=eq.${id}`, { method: 'DELETE', headers })
    } catch (err) {
      console.error('Failed to delete gallery item:', err)
      loadGallery()
    }
  }

  const myCompletions = useMemo(() =>
    completions.filter(c => c.completed_by === username),
  [completions, username])

  const completedWorkshopIds = useMemo(() =>
    new Set(myCompletions.map(c => c.workshop_id)),
  [myCompletions])

  // In-progress workshops: have saved step progress in localStorage but not completed
  const inProgressWorkshops = useMemo(() => {
    const userId = user?.id || username
    return libraryWorkshops.filter(w => {
      if (completedWorkshopIds.has(w.id)) return false
      try {
        const saved = JSON.parse(localStorage.getItem(`workshop-progress-${userId}-${w.id}`))
        return saved && Array.isArray(saved) && saved.length > 0
      } catch { return false }
    })
  }, [libraryWorkshops, completedWorkshopIds, user, username, progressTick])

  const getProgress = (workshopId) => {
    const userId = user?.id || username
    try {
      const saved = JSON.parse(localStorage.getItem(`workshop-progress-${userId}-${workshopId}`))
      return saved && Array.isArray(saved) ? saved.length : 0
    } catch { return 0 }
  }

  const sectionTabs = [
    { id: 'library', label: 'Library', icon: Library, count: libraryWorkshops.length },
    { id: 'in-progress', label: 'In Progress', icon: PlayCircle, count: inProgressWorkshops.length },
    ...(canCreate ? [{ id: 'my', label: 'My Workshops', icon: BookOpen, count: myWorkshops.length }] : []),
    { id: 'completed', label: 'Completed', icon: Trophy, count: myCompletions.length },
    ...(canReview ? [{ id: 'review', label: 'Review', icon: Eye, count: reviewQueue.length }] : []),
    { id: 'gallery', label: 'Gallery', icon: Image, count: galleryItems.length },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Workshops
            </h1>
            <p className="text-sm text-gray-300">Create, share, and learn from team workshops</p>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            {canCreate && (
              <button
                onClick={() => { setEditingWorkshop(null); setCreateModal(true) }}
                className="flex items-center gap-1.5 px-3 py-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-xl text-sm font-semibold text-gray-100 transition-colors"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Create Workshop</span>
              </button>
            )}
            <NotificationBell />
          </div>
        </div>

        {/* Section tabs */}
        <div className="px-4 ml-14 flex gap-1 pb-2 overflow-x-auto text-gray-200">
          {sectionTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSection(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                section === tab.id
                  ? 'bg-brand-blue/30 text-brand-blue-dark'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  section === tab.id ? 'bg-brand-blue-dark/20' : 'bg-gray-200'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Workshop Library */}
          {section === 'library' && (
            <>
              {libraryWorkshops.length > 0 ? (
                <div className="space-y-3">
                  {libraryWorkshops.map(w => (
                    <WorkshopCard
                      key={w.id}
                      workshop={w}
                      onClick={() => setActiveWorkshop(w)}
                      onAdminEdit={canReview ? handleEdit : null}
                      onAdminDelete={canReview ? handleAdminDelete : null}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Library size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm">No approved workshops yet.</p>
                  {canCreate && (
                    <button
                      onClick={() => { setEditingWorkshop(null); setCreateModal(true) }}
                      className="mt-3 text-sm text-brand-yellow-dark hover:underline font-medium"
                    >
                      Be the first to create one!
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* In Progress */}
          {section === 'in-progress' && (
            <>
              {inProgressWorkshops.length > 0 ? (
                <div className="space-y-3">
                  {inProgressWorkshops.map(w => {
                    const cd = w.content_data || {}
                    const rawSteps = (cd.steps || []).map(s => typeof s === 'string' ? { text: s, image: '' } : s).filter(s => s.text?.trim())
                    const totalSteps = rawSteps.length
                    const doneSteps = getProgress(w.id)
                    const fmt = FORMATS.find(f => f.id === w.format_type)

                    return (
                      <div
                        key={w.id}
                        className="bg-white rounded-xl shadow-sm border border-brand-yellow/30 p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => setActiveWorkshop(w)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {fmt && <fmt.icon size={14} className="text-brand-blue-dark shrink-0" />}
                              <h3 className="text-sm font-semibold text-gray-800 truncate">{w.title}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{w.creator_name}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/20 text-brand-blue-dark font-medium">{w.category}</span>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-yellow/30 text-brand-yellow-dark font-medium shrink-0">
                            {doneSteps}/{totalSteps} steps
                          </span>
                        </div>
                        {totalSteps > 0 && (
                          <div className="flex gap-1 mt-3">
                            {rawSteps.map((_, i) => (
                              <div
                                key={i}
                                className={`flex-1 h-1.5 rounded-full ${i < doneSteps ? 'bg-green-400' : 'bg-gray-200'}`}
                              />
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-brand-yellow-dark font-medium mt-2">Tap to resume</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-20">
                  <PlayCircle size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm">No workshops in progress.</p>
                </div>
              )}
            </>
          )}

          {/* My Workshops */}
          {section === 'my' && canCreate && (
            <>
              {/* Status filter */}
              <div className="flex gap-1 flex-wrap">
                {['all', 'draft', 'submitted', 'approved', 'needs_revision', 'denied'].map(f => (
                  <button
                    key={f}
                    onClick={() => setMyFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      myFilter === f
                        ? 'bg-brand-yellow text-gray-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? 'All' : STATUS_LABELS[f]}
                  </button>
                ))}
              </div>

              {filteredMyWorkshops.length > 0 ? (
                <div className="space-y-3">
                  {filteredMyWorkshops.map(w => (
                    <WorkshopCard
                      key={w.id}
                      workshop={w}
                      onClick={() => setViewWorkshop(w)}
                      showStatus
                      showActions
                      onDelete={handleDelete}
                      onWithdraw={handleWithdraw}
                      onEdit={handleEdit}
                      onSubmit={handleSubmit}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm">
                    {myFilter === 'all' ? "You haven't created any workshops yet." : `No ${STATUS_LABELS[myFilter]?.toLowerCase()} workshops.`}
                  </p>
                  {myFilter === 'all' && (
                    <button
                      onClick={() => { setEditingWorkshop(null); setCreateModal(true) }}
                      className="mt-3 text-sm text-brand-yellow-dark hover:underline font-medium"
                    >
                      Create your first workshop
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Review Queue (Top users only) */}
          {section === 'review' && canReview && (
            <>
              {reviewQueue.length > 0 ? (
                <div className="space-y-3">
                  {reviewQueue.map(w => (
                    <WorkshopCard
                      key={w.id}
                      workshop={w}
                      onClick={() => setViewWorkshop(w)}
                      showStatus
                      onAdminDelete={handleAdminDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Check size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm">No workshops pending review.</p>
                </div>
              )}
            </>
          )}

          {/* Completed */}
          {section === 'completed' && (
            <>
              {myCompletions.length > 0 ? (
                <div className="space-y-3">
                  {myCompletions.map(c => {
                    const w = workshops.find(ws => ws.id === c.workshop_id)
                    const fmt = w ? FORMATS.find(f => f.id === w.format_type) : null
                    return (
                      <div key={c.id} className="bg-white rounded-xl shadow-sm border border-green-100 p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {fmt && <fmt.icon size={14} className="text-brand-blue-dark shrink-0" />}
                              <h3 className="text-sm font-semibold text-gray-800 truncate">{c.workshop_title}</h3>
                            </div>
                            <p className="text-xs text-gray-400">Completed {formatDate(c.completed_at)}</p>
                            {c.photo_url && (
                              <img src={c.photo_url} alt="Your work" className="mt-2 rounded-lg h-32 object-cover" />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Trophy size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm">No completed workshops yet.</p>
                  <button
                    onClick={() => setSection('library')}
                    className="mt-3 text-sm text-brand-yellow-dark hover:underline font-medium"
                  >
                    Browse the library to get started
                  </button>
                </div>
              )}
            </>
          )}

          {/* Gallery */}
          {section === 'gallery' && (
            <>
              {galleryItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {galleryItems.map(item => (
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <img src={item.image_url} alt={item.caption || 'Gallery'} loading="lazy" decoding="async" className="w-full h-40 object-cover" />
                      <div className="p-3">
                        {item.caption && <p className="text-sm text-gray-700 mb-1">{item.caption}</p>}
                        {item.workshop_title && (
                          <p className="text-xs text-brand-blue-dark font-medium mb-1">
                            From: {item.workshop_title}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">{item.submitted_by} &middot; {formatDate(item.created_at)}</span>
                          {(canReview || item.submitted_by === username) && (
                            <button
                              onClick={() => handleGalleryDelete(item.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Image size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400 text-sm">No gallery photos yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Complete a workshop and share a photo of your work!</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      {createModal && (
        <CreateWorkshopModal
          onClose={() => { setCreateModal(false); setEditingWorkshop(null) }}
          onSave={handleSave}
          editing={editingWorkshop}
        />
      )}

      {viewWorkshop && (
        <WorkshopDetailModal
          workshop={viewWorkshop}
          onClose={() => setViewWorkshop(null)}
          canReview={canReview}
          onReview={handleReview}
        />
      )}

      {activeWorkshop && (
        <WorkshopViewer
          workshop={activeWorkshop}
          onClose={() => { setActiveWorkshop(null); setProgressTick(t => t + 1) }}
          userId={user?.id || username}
          username={username}
          onComplete={handleWorkshopComplete}
          onSave={() => { setActiveWorkshop(null); setProgressTick(t => t + 1); setSection('in-progress') }}
        />
      )}
    </div>
  )
}
