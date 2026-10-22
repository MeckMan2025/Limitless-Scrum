import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { ArrowRight, Send, Plus, X, Trash2, FolderOpen, ExternalLink, ChevronDown, ChevronUp, Pencil, Camera, Loader2, GraduationCap, BookOpen, Image as ImageIcon } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { ACTIVE_SEASON, seasonOf } from '../data/season'
import { onlyMyTeam, stampTeam, storedTeamScope, teamScope } from '../lib/teamScope'
import NotebookBook from './NotebookBook'
import NotebookPhotos from './NotebookPhotos'
import { isVoice, voiceStatusLine, VoiceTag, VoiceEntryEditor } from './VoiceEntry'
// Loaded only when someone opens it, so the notebook doesn't carry it.
const HelperRecorder = lazy(() => import('../helper/HelperApp').then(m => ({ default: m.Recorder })))
import { SIGNAL_BY_KEY } from '../data/notebookSignals'
import { CATEGORIES, WHY_OPTIONS } from '../data/notebookOptions'
import { claimNotebookAttendance } from '../lib/notebookAttendance'
import SignalPicker, { SignalQuestions } from './NotebookSignals'
import { thumbUrl, thumbFallback } from '../lib/photos'
import { uploadNotebookPhoto } from '../lib/notebookPhoto'
import { HOME_TEAM_NUMBER } from '../data/team'

// One page of the entry, drawn as a page: cream stock, faint rules, and the
// red margin a notebook has. The question is the heading, in the handwriting
// the rest of the app uses for anything paper.
// Ruled in the team's two colours, alternating. RULE is the gap between lines —
// the contents rows are set to the same height so each date sits on a line
// instead of drifting between them.
const RULE = 36
const PAPER = {
  backgroundColor: '#ffffff',
  backgroundImage: [
    'repeating-linear-gradient(',
    `#ffffff 0px, #ffffff ${RULE - 1}px, #bfdbfe ${RULE}px,`,
    `#ffffff ${RULE + 1}px, #ffffff ${RULE * 2 - 1}px, #fbcfe8 ${RULE * 2}px`,
    ')',
  ].join(''),
}

function Page({ title, sub, children }) {
  return (
    <div className="relative rounded-lg border border-gray-200 shadow-sm overflow-hidden" style={PAPER}>
      {/* The margin line, and the gutter that keeps text off it. */}
      <div className="absolute top-0 bottom-0 left-8 w-px bg-red-300/60" />
      <div className="relative pl-12 pr-4 py-4 space-y-3">
        <div>
          <h3 className="text-xl leading-tight text-gray-700" style={{ fontFamily: "'Kalam', cursive" }}>
            {title}
          </h3>
          {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

// Local calendar date. toISOString() is UTC, so after ~7pm Central it rolls to
// tomorrow — an evening entry would default to the wrong meeting date and slip
// out of today's activity count.
function todayLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}


const CATEGORY_COLORS = {
  Technical: 'bg-blue-100 text-blue-700',
  Programming: 'bg-orange-100 text-orange-700',
  Business: 'bg-pink-100 text-pink-700',
  Custom: 'bg-gray-100 text-gray-600',
}

const ENGAGEMENT_OPTIONS = [
  { value: 'Very', label: 'Very Engaged', dot: 'bg-green-400' },
  { value: 'Somewhat', label: 'Somewhat', dot: 'bg-yellow-400' },
  { value: 'Not', label: 'Not Engaged', dot: 'bg-red-400' },
]

const INITIAL_ENTRY = {
  category: 'Technical',
  customCategory: '',
  whatDid: '',
  whyOption: '',
  whyNote: '',
  engagement: '',
  engagementNote: '',
  mentorHelp: false,
  mentorName: '',
  mentorNote: '',
  projectId: '',
  projectLink: '',
  photoUrl: '',
  // What happened today. Empty is a perfectly good answer — plenty of
  // meetings are just work, and pretending otherwise would make the numbers
  // meaningless.
  signals: [],
  signalData: {},
  nextStep: '',
}

const INITIAL_PROJECT = {
  name: '',
  category: 'Technical',
  goal: '',
  reason: '',
  status: 'Active',
}

function SectionHeader({ title }) {
  return <h2 className="text-lg font-semibold text-gray-700 border-b-2 border-brand-yellow pb-1">{title}</h2>
}

export default function EngineeringNotebook() {
  const { username, user } = useUser()
  const { canOrganizeNotebook, canSubmitNotebook, isGuest, myTeamNumber } = usePermissions()
  // One rule for whose rows these are — see lib/teamScope.js.
  const SCOPE = teamScope(myTeamNumber)
  const isLead = canOrganizeNotebook
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const [view, setView] = useState('projects')
  const [entries, setEntries] = useState([])
  const [projects, setProjects] = useState([])
  const [formData, setFormData] = useState({ ...INITIAL_ENTRY })
  const [meetingDate, setMeetingDate] = useState(todayLocal)
  // Which page of the entry is open.
  const [step, setStep] = useState(0)
  // Pages 0–5 are the original questions, unchanged. Page 6 asks what
  // happened today, each chosen signal gets its own page after that, and the
  // evidence page stays last — so an entry with no signals is exactly one
  // extra tap on the way through, and an entry with three is three pages
  // that only ask about the three.
  const SIGNAL_STEP = 6
  const chosenSignals = (formData.signals || [])
    .map(k => SIGNAL_BY_KEY[k])
    .filter(Boolean)
  const EVIDENCE_STEP = SIGNAL_STEP + 1 + chosenSignals.length
  const LAST_STEP = EVIDENCE_STEP
  // Meeting days, so a late entry can be filed against the meeting it belongs
  // to. These are the same days attendance is taken on, which is what decides
  // whether a missing entry counts against you.
  const [meetingDays, setMeetingDays] = useState([])
  const [editingEntryId, setEditingEntryId] = useState(null)
  // Unticking a signal shortens the flow; without this, a student standing on
  // a page that no longer exists gets a blank card and no way forward.
  useEffect(() => {
    setStep(st => Math.min(st, SIGNAL_STEP + 1 + (formData.signals || []).length))
  }, [formData.signals]) // eslint-disable-line
  const [projectForm, setProjectForm] = useState({ ...INITIAL_PROJECT })
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [submitFeedback, setSubmitFeedback] = useState(null)
  // The write is in flight. Submit stays put until it comes back.
  const [saving, setSaving] = useState(false)
  // Whose entries are on screen. Reading the team's is open to everyone;
  // every write path still checks the author, so this changes what you can
  // SEE and nothing about what you can change.
  const [showTeamEntries, setShowTeamEntries] = useState(false)
  const teamDefaultRef = useRef(false)
  useEffect(() => {
    if (!teamDefaultRef.current && isLead) {
      teamDefaultRef.current = true
      setShowTeamEntries(true)
    }
  }, [isLead])
  const [filterSeason, setFilterSeason] = useState(ACTIVE_SEASON)
  const [filterStudent, setFilterStudent] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterEngagement, setFilterEngagement] = useState('')
  // Adults on the roster, to name who helped. Optional — the yes/no is the
  // part that matters for judging.
  const [mentors, setMentors] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [expandedProject, setExpandedProject] = useState(null)
  // Which topic's notebook is being read. null is the whole notebook.
  const [bookProject, setBookProject] = useState(null)
  const [showRequestProjectModal, setShowRequestProjectModal] = useState(false)
  const [requestProjectName, setRequestProjectName] = useState('')

  // Everything about an entry except the photo. Photos are stored inline as
  // data URIs, so asking for select=* meant ~4 MB before the page could show
  // anything — the projects and entries were waiting on image data nobody had
  // scrolled to yet. They're fetched separately and merged in after.
  const BASE_ENTRY_COLS = 'id,username,meeting_date,category,custom_category,what_did,why_option,why_note,' +
    'engagement,engagement_note,mentor_help,mentor_name,mentor_note,project_id,project_link,flash_id,season,created_at'
  // Asked for separately so a database without them yet can't take the whole
  // notebook down with it — see the retry below.
  const SIGNAL_COLS = 'signals,signal_data,next_step'
  const ENTRY_COLS = `${BASE_ENTRY_COLS},${SIGNAL_COLS}`
  // EN Helper's voice entries (supabase/en_helper.sql). Asked for the same
  // way, so the notebook loads exactly as before until that file is run.
  const VOICE_COLS = 'source,transcript,polished,ai_status,complete'
  // Whether the voice columns exist, which is also whether EN Helper is on.
  const [voiceReady, setVoiceReady] = useState(false)
  // A voice entry whose written-up version is being corrected.
  const [editingVoice, setEditingVoice] = useState(null)
  // EN Helper opened from here sits on top of the notebook, so closing it
  // lands straight back on the notebook: no reload, no intro, no sign-in.
  const [showHelper, setShowHelper] = useState(false)

  // Load data via direct fetch
  useEffect(() => {
    const headers = restHeaders()
    // One rule, applied to every read below.
    const scope = teamScope(myTeamNumber)
    async function load() {
      try {
        const [vRes, pRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/notebook_entries?select=${ENTRY_COLS},${VOICE_COLS}&${scope}&order=created_at.desc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/notebook_projects?select=*&${scope}&order=created_at.desc`, { headers }),
        ])
        // Without the voice columns yet, ask again without them: every entry
        // still loads, and EN Helper simply stays out of sight.
        const eRes = vRes.ok ? vRes
          : await fetch(`${supabaseUrl}/rest/v1/notebook_entries?select=${ENTRY_COLS}&${scope}&order=created_at.desc`, { headers })
        if (vRes.ok) setVoiceReady(true)
        if (eRes.ok) {
          setEntries(await eRes.json())
        } else {
          // Selecting a column that doesn't exist fails the whole query, so
          // until notebook_signals.sql is run this would leave the notebook
          // completely empty rather than merely missing the new fields. Ask
          // again without them: every older entry still loads and reads
          // exactly as it did.
          console.warn('Entry fetch failed; retrying without the evidence columns.')
          const retry = await fetch(
            `${supabaseUrl}/rest/v1/notebook_entries?select=${BASE_ENTRY_COLS}&${scope}&order=created_at.desc`,
            { headers })
          if (retry.ok) setEntries(await retry.json())
        }
        if (pRes.ok) setProjects(await pRes.json())
      } catch (err) {
        console.error('Failed to load notebook data:', err)
      }
      // Now the photos, folded into the entries already on screen.
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?select=id,photo_url&${scope}&or=(photo_url.like.data:*,photo_url.like.http*)`, { headers })
        if (!res.ok) return
        const byId = Object.fromEntries((await res.json()).map(r => [r.id, r.photo_url]))
        setEntries(prev => prev.map(e => byId[e.id] ? { ...e, photo_url: byId[e.id] } : e))
      } catch { /* the page works without them */ }
    }
    load()
  }, [])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('notebook-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notebook_entries' }, onlyMyTeam((payload) => {
        setEntries(prev => prev.some(e => e.id === payload.new.id) ? prev : [payload.new, ...prev])
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notebook_entries' }, onlyMyTeam((payload) => {
        setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new : e))
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notebook_entries' }, onlyMyTeam((payload) => {
        setEntries(prev => prev.filter(e => e.id !== payload.old.id))
      }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notebook_projects' }, onlyMyTeam((payload) => {
        setProjects(prev => prev.some(p => p.id === payload.new.id) ? prev : [payload.new, ...prev])
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notebook_projects' }, onlyMyTeam((payload) => {
        setProjects(prev => prev.map(p => p.id === payload.new.id ? payload.new : p))
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notebook_projects' }, onlyMyTeam((payload) => {
        setProjects(prev => prev.filter(p => p.id !== payload.old.id))
      }))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])


  // Mentors and coaches, for the "who helped" dropdown.
  useEffect(() => {
    let active = true
    fetch(`${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=display_name,function_tags&order=display_name`, {
      headers: restHeaders(),
    })
      .then(res => (res.ok ? res.json() : []))
      .then(rows => {
        if (!active) return
        const list = Array.isArray(rows) ? rows : []
        setMentors(
          list
            .filter(r => (r.function_tags || []).some(t => t === 'Mentor' || t === 'Coach'))
            .map(r => r.display_name)
            .filter(Boolean)
        )
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    // Only meetings this person was actually marked at. Someone with no record
    // for a day was never on that meeting's roster — usually it happened before
    // they joined — so there is nothing for them to write up.
    const h = restHeaders()
    Promise.all([
      fetch(`${supabaseUrl}/rest/v1/attendance_sessions?${SCOPE}&select=id,session_date&order=session_date.desc`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${supabaseUrl}/rest/v1/attendance_records?${SCOPE}&username=eq.${encodeURIComponent(username)}&select=session_id`, { headers: h }).then(r => r.ok ? r.json() : []),
    ])
      .then(([sessions, mine]) => {
        if (!active) return
        const marked = new Set((mine || []).map(r => r.session_id))
        setMeetingDays([...new Set((sessions || []).filter(s => marked.has(s.id)).map(s => s.session_date))])
      })
      .catch(() => {})
    return () => { active = false }
  }, [username])

  // Days a lead marked this person absent themselves. An entry is what proves
  // you were at a meeting, so writing one for a day a lead says you missed is
  // the one case that has to be refused — the rule's own absences stay open,
  // because winning those back by writing the entry is the point.
  const [leadAbsentDays, setLeadAbsentDays] = useState(new Set())
  const [excusedDays, setExcusedDays] = useState(new Set())
  useEffect(() => {
    if (!username) { setLeadAbsentDays(new Set()); setExcusedDays(new Set()); return }
    let live = true
    const h = restHeaders()
    Promise.all([
      fetch(`${supabaseUrl}/rest/v1/attendance_sessions?${SCOPE}&select=id,session_date`, { headers: h })
        .then(r => (r.ok ? r.json() : [])),
      fetch(`${supabaseUrl}/rest/v1/attendance_records?${SCOPE}&username=eq.${encodeURIComponent(username)}&status=in.(absent,excused)&select=session_id,status,marked_by`, { headers: h })
        .then(r => (r.ok ? r.json() : [])),
    ]).then(([sess, recs]) => {
      if (!live) return
      const dateOf = Object.fromEntries((sess || []).map(x => [x.id, x.session_date]))
      setLeadAbsentDays(new Set((recs || [])
        .filter(r => r.status === 'absent' && r.marked_by && r.marked_by !== 'notebook-rule')
        .map(r => dateOf[r.session_id])
        .filter(Boolean)))
      // Being excused is the point of asking ahead of time. Nobody should then
      // be chased for a write-up of a meeting they were excused from.
      setExcusedDays(new Set((recs || [])
        .filter(r => r.status === 'excused')
        .map(r => dateOf[r.session_id])
        .filter(Boolean)))
    }).catch(() => {})
    return () => { live = false }
  }, [username])

  const blockedDay = leadAbsentDays.has(meetingDate)

  // What each page needs before it will let you turn over. Only the pages that
  // actually require something are listed; the rest are free to skip.
  const stepReady = (() => {
    if (step === 0) return !!meetingDate && !blockedDay
    if (step === 1) return !!formData.whatDid.trim()
    if (step === 2) return !!formData.whyOption && (formData.whyOption !== 'Other' || !!formData.whyNote.trim())
    if (step === 3) return !!formData.engagement && !!formData.engagementNote.trim()
    // At least one thing has to be ticked. The follow-up questions behind each
    // one stay optional — this is only asking which of them happened.
    if (step === SIGNAL_STEP) return (formData.signals || []).length > 0
    return true
  })()

  // Meetings this person has no entry for yet — what they'd be marked absent
  // for. Days a lead already marked them absent aren't offered: there is
  // nothing to win back there.
  const missingDays = meetingDays.filter(
    d => d <= todayLocal()
      && !entries.some(e => e.username === username && e.meeting_date === d && e.complete !== false)
      && !leadAbsentDays.has(d)
      && !excusedDays.has(d)
  )

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  // Writing the entry is what wins the meeting back. See lib/notebookAttendance.js.
  const claimAttendance = async (dateStr) => {
    if (await claimNotebookAttendance(username, dateStr, SCOPE)) {
      setSubmitFeedback('Entry saved. You\'re marked present for that meeting again.')
    }
  }

  // Submit entry
  const handleSubmitEntry = async () => {
    if (blockedDay || saving) return
    if (!formData.whatDid.trim()) return
    if (!formData.whyOption) return
    if (formData.whyOption === 'Other' && !formData.whyNote.trim()) return
    if (!formData.photoUrl && !formData.projectLink.trim()) return
    // Engagement used to default to Somewhat, so an untouched form still
    // reported one — which is worth nothing as data. It has to be chosen.
    if (!formData.engagement) return
    if (!formData.engagementNote.trim()) return
    if (!(formData.signals || []).length) return
    // A photo still going up means photoUrl is empty. Submitting now would
    // save the entry without the picture the student waited for.
    if (formData._uploading) return

    if (localStorage.getItem('scrum-sfx-enabled') !== 'false') new Audio('/sounds/click.mp3').play().catch(() => {})

    const entryData = {
      username,
      meeting_date: meetingDate,
      category: formData.category,
      custom_category: formData.category === 'Custom' ? formData.customCategory : '',
      what_did: formData.whatDid.trim(),
      why_option: formData.whyOption,
      why_note: formData.whyNote.trim(),
      engagement: formData.engagement,
      engagement_note: formData.engagementNote.trim(),
      mentor_help: !!formData.mentorHelp,
      mentor_name: formData.mentorHelp ? formData.mentorName.trim() : '',
      mentor_note: formData.mentorHelp ? formData.mentorNote.trim() : '',
      project_id: formData.projectId,
      project_link: formData.projectLink.trim(),
      photo_url: formData.photoUrl.trim(),
      season: ACTIVE_SEASON,
      // Only the answers for signals still ticked. Ticking something, filling
      // it in, then unticking it would otherwise leave orphaned answers that
      // the dashboard would happily count.
      signals: formData.signals || [],
      signal_data: Object.fromEntries(
        (formData.signals || [])
          .filter(k => SIGNAL_BY_KEY[k])
          .map(k => [k, formData.signalData?.[k] || {}])
      ),
      next_step: (formData.nextStep || '').trim(),
      // Whose entry this is. Radical rows stay unstamped, which is what NULL
      // means everywhere else.
      ...(myTeamNumber && myTeamNumber !== HOME_TEAM_NUMBER ? { team_number: String(myTeamNumber) } : {}),
    }

    // If the evidence columns aren't there yet, a write naming them fails
    // outright and the student loses the entry they just wrote. The entry
    // matters more than the signals, so drop them and try once more.
    const withoutSignals = (data) => {
      const { signals, signal_data, next_step, ...rest } = data // eslint-disable-line no-unused-vars
      return rest
    }
    const missingSignalCols = (text) => /signals|signal_data|next_step/.test(text || '')

    const JSON_HEADERS = restHeaders({ 'Content-Type': 'application/json' })

    // One attempt, with the signals-column retry folded in.
    const write = async (url, method, body) => {
      const res = await fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) })
      if (res.ok) return true
      const text = await res.text().catch(() => '')
      if (missingSignalCols(text)) {
        const retry = await fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(withoutSignals(body)) })
        if (retry.ok) return true
      }
      console.error('Notebook save failed:', text)
      return false
    }

    // The form used to be cleared and closed on the line after the request was
    // fired, before anyone knew whether it had worked. When it hadn't — a
    // phone on bad school wifi, most often — seven pages of answers were gone,
    // the entry was never written, and the meeting was never claimed, which is
    // why this looked like an attendance problem rather than a save problem.
    // Nothing is thrown away now until the write has actually come back.
    setSaving(true)
    setSubmitFeedback(null)
    try {
      const id = editingEntryId
      // Built here rather than re-read after writing: the row is already known,
      // and a second request is another thing that can fail — plus egress the
      // team is actively trying to stay under.
      const newEntry = id ? null : {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        ...entryData,
        created_at: new Date().toISOString(),
      }
      const ok = id
        ? await write(`${supabaseUrl}/rest/v1/notebook_entries?id=eq.${id}`, 'PATCH', entryData)
        : await write(`${supabaseUrl}/rest/v1/notebook_entries`, 'POST', newEntry)

      if (!ok) {
        setSubmitFeedback("Couldn't save — your entry is still here. Check your connection and try again.")
        return
      }

      // Saved. Now it is safe to show it, claim the meeting, and let go of it.
      if (id) {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, ...entryData } : e))
      } else {
        // Realtime may have delivered it already.
        setEntries(prev => (prev.some(e => e.id === newEntry.id) ? prev : [newEntry, ...prev]))
      }

      claimAttendance(entryData.meeting_date)
      setSubmitFeedback(id ? 'Entry updated!' : 'Entry saved!')
      setFormData({ ...INITIAL_ENTRY })
      setEditingEntryId(null)
      setStep(0)
      setView('projects')
      setTimeout(() => setSubmitFeedback(null), 3000)
    } catch (err) {
      console.error('Failed to save entry:', err)
      setSubmitFeedback("Couldn't save — your entry is still here. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }


  // Delete entry (co-founders only)
  // Load an existing entry back into the form. handleSubmitEntry already
  // PATCHes when editingEntryId is set — nothing ever set it until now.
  const startEditEntry = (entry) => {
    if (entry.username !== username) return
    // A voice entry is corrected by fixing its written-up version. The typed
    // form would ask for a photo or link it never needed.
    if (entry.source === 'voice') { setEditingVoice(entry); return }
    setFormData({
      category: entry.category || 'Technical',
      customCategory: entry.custom_category || '',
      whatDid: entry.what_did || '',
      whyOption: entry.why_option || '',
      whyNote: entry.why_note || '',
      engagement: entry.engagement || '',
      engagementNote: entry.engagement_note || '',
      mentorHelp: !!entry.mentor_help,
      mentorName: entry.mentor_name || '',
      mentorNote: entry.mentor_note || '',
      projectId: entry.project_id || '',
      projectLink: entry.project_link || '',
      photoUrl: entry.photo_url || '',
      // An entry written before signals existed opens with none ticked, which
      // is exactly right — it has no answer to give.
      signals: Array.isArray(entry.signals) ? entry.signals : [],
      signalData: entry.signal_data || {},
      nextStep: entry.next_step || '',
    })
    setMeetingDate(entry.meeting_date || todayLocal())
    setEditingEntryId(entry.id)
    setView('entry')
  }

  // Your own, or anyone's if you're a lead. Checked here as well as on the
  // button, so hiding the button is not the only thing protecting an entry.
  const handleDeleteEntry = (entry) => {
    const target = typeof entry === 'string' ? entries.find(e => e.id === entry) : entry
    if (!target) return
    if (!isLead && target.username !== username) return

    const mine = target.username === username
    if (!window.confirm(mine
      ? 'Delete this entry? It also gives up the attendance it claimed for that day.'
      : `Delete ${target.username}'s entry for ${target.meeting_date}?`)) return

    const keep = entries
    setEntries(prev => prev.filter(e => e.id !== target.id))
    fetch(`${supabaseUrl}/rest/v1/notebook_entries?id=eq.${target.id}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).then(res => {
      // Without this a failed delete looks like it worked until the next load.
      if (!res.ok) { console.error('Delete failed'); setEntries(keep) }
    }).catch(err => { console.error('Failed to delete entry:', err); setEntries(keep) })
  }

  // Submit project
  const handleSubmitProject = () => {
    if (!projectForm.name.trim()) return
    if (editingProjectId) {
      const updateData = {
        name: projectForm.name.trim(),
        category: projectForm.category,
        goal: projectForm.goal.trim(),
        reason: projectForm.reason.trim(),
        status: projectForm.status,
      }
      setProjects(prev => prev.map(p => p.id === editingProjectId ? { ...p, ...updateData } : p))
      fetch(`${supabaseUrl}/rest/v1/notebook_projects?id=eq.${editingProjectId}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
        body: JSON.stringify(updateData),
      }).catch(err => console.error('Failed to update project:', err))
    } else {
      const newProject = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        ...stampTeam({}, myTeamNumber),
        ...projectForm,
        name: projectForm.name.trim(),
        goal: projectForm.goal.trim(),
        reason: projectForm.reason.trim(),
        created_by: username,
        created_at: new Date().toISOString(),
      }
      setProjects(prev => [newProject, ...prev])
      fetch(`${supabaseUrl}/rest/v1/notebook_projects`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
        body: JSON.stringify(newProject),
      }).catch(err => console.error('Failed to save project:', err))
    }
    setProjectForm({ ...INITIAL_PROJECT })
    setEditingProjectId(null)
    setShowProjectModal(false)
  }

  // Delete project
  const handleDeleteProject = (id) => {
    setProjects(prev => prev.filter(p => p.id !== id))
    fetch(`${supabaseUrl}/rest/v1/notebook_projects?id=eq.${id}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(err => console.error('Failed to delete project:', err))
  }

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterSeason) result = result.filter(e => seasonOf(e) === filterSeason)
    if (!showTeamEntries) result = result.filter(e => e.username === username)
    if (filterStudent) result = result.filter(e => e.username === filterStudent)
    if (filterCategory) result = result.filter(e => e.category === filterCategory)
    if (filterProject) result = result.filter(e => e.project_id === filterProject)
    if (filterEngagement) result = result.filter(e => e.engagement === filterEngagement)
    return result
  }, [entries, showTeamEntries, isLead, username, filterSeason, filterStudent, filterCategory, filterProject, filterEngagement])

  // Seasons available in the data (plus the active one), newest first
  const availableSeasons = useMemo(() => {
    const set = new Set([ACTIVE_SEASON])
    entries.forEach(e => set.add(seasonOf(e)))
    return Array.from(set).sort().reverse()
  }, [entries])

  // Group by date
  const groupedEntries = useMemo(() => {
    const groups = {}
    filteredEntries.forEach(e => {
      const key = e.meeting_date || 'Unknown'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredEntries])

  // Unique students for filter
  const studentNames = useMemo(() => [...new Set(entries.map(e => e.username))].sort(), [entries])

  const activeProjects = projects.filter(p => p.status === 'Active')
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

  const formatDate = (dateStr) => {
    try {
      const [y, m, d] = dateStr.split('-')
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    } catch { return dateStr }
  }

  const PERMANENT_PROJECTS = [
    { id: '_technical', name: 'Technical', permanent: true },
    { id: '_business', name: 'Business', permanent: true },
    { id: '_programming', name: 'Programming', permanent: true },
  ]

  // Which category each permanent folder stands for, so the folder id and the
  // category it counts are stated once rather than in three places.
  const PERMANENT_CATEGORY = {
    _technical: 'Technical',
    _business: 'Business',
    _programming: 'Programming',
  }

  const allDisplayProjects = [
    ...PERMANENT_PROJECTS,
    ...projects.filter(p => p.status === 'Active').map(p => ({ ...p, permanent: false })),
  ]

  const getProjectEntries = (projectId) => {
    let result
    // Entries with a project_id matching an active custom project belong to that project.
    // All other entries fall back to their category's permanent project.
    const activeProjectIds = new Set(projects.filter(p => p.status === 'Active').map(p => p.id))

    if (projectId === '_technical') {
      result = entries.filter(e => e.category === 'Technical' && !(e.project_id && activeProjectIds.has(e.project_id)))
    } else if (projectId === '_business') {
      result = entries.filter(e => e.category === 'Business' && !(e.project_id && activeProjectIds.has(e.project_id)))
    } else if (projectId === '_programming') {
      result = entries.filter(e => e.category === 'Programming' && !(e.project_id && activeProjectIds.has(e.project_id)))
    } else {
      result = entries.filter(e => e.project_id === projectId)
    }
    if (!showTeamEntries) {
      result = result.filter(e => e.username === username)
    }
    // Only show entries from the selected season (so archived seasons don't leak into the folders)
    result = result.filter(e => seasonOf(e) === filterSeason)
    return result
  }

  // The number shown on a folder.
  //
  // Deliberately not getProjectEntries().length. The three permanent category
  // folders list only entries NOT filed under a project, because an entry
  // belongs in one place and a project folder is where it goes. But the COUNT
  // on Technical should be every Technical entry there is — filing something
  // under a project shouldn't make it vanish from the total above it, which
  // read like work had gone missing.
  //
  // So the totals add up to more than the folders list, on purpose.
  const getProjectCount = (projectId) => {
    const category = PERMANENT_CATEGORY[projectId]
    if (!category) return getProjectEntries(projectId).length
    let result = entries.filter(e => e.category === category)
    if (!showTeamEntries) result = result.filter(e => e.username === username)
    return result.filter(e => seasonOf(e) === filterSeason).length
  }

  const groupByDate = (entryList) => {
    const groups = {}
    entryList.forEach(e => {
      const key = e.meeting_date || 'Unknown'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }

  const handleNewEntryFromProject = (projectId) => {
    const newForm = { ...INITIAL_ENTRY }
    if (projectId === '_technical') {
      newForm.category = 'Technical'
    } else if (projectId === '_business') {
      newForm.category = 'Business'
    } else if (projectId === '_programming') {
      newForm.category = 'Programming'
    } else {
      const proj = projects.find(p => p.id === projectId)
      newForm.projectId = projectId
      newForm.category = proj?.category || 'Technical'
    }
    setFormData(newForm)
    setEditingEntryId(null)
    setView('entry')
  }

  const handleRequestProject = () => {
    if (!requestProjectName.trim()) return
    const request = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      type: 'notebook_project',
      data: { name: requestProjectName.trim() },
      requested_by: username,
      requested_by_user_id: user?.id,
      status: 'pending',
    }
    setRequestProjectName('')
    setShowRequestProjectModal(false)
    setSubmitFeedback('Project request submitted for approval!')
    setTimeout(() => setSubmitFeedback(null), 3000)
    fetch(`${supabaseUrl}/rest/v1/requests`, {
      method: 'POST',
      headers: restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify(request),
    }).catch(err => console.error('Failed to request project:', err))
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 text-gray-200">
          <div className="flex items-center justify-between gap-2 text-gray-200">
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Engineering Notebook
            </h1>
            <NotificationBell />
          </div>
          {/* What you're looking at: whose entries, and which season. One row,
              one height, one shape. Writing and reading live in the toolbar
              below, so the header only answers "what am I looking at". */}
          <div className="flex items-center gap-2 mt-2 text-gray-200">
            <div className="inline-flex h-8 rounded-lg border border-gray-700 overflow-hidden text-xs bg-white">
              {[[false, 'Mine'], [true, "Everyone's"]].map(([val, label]) => (
                <button
                  key={label}
                  onClick={() => setShowTeamEntries(val)}
                  className={`px-3 font-medium transition-colors ${
                    showTeamEntries === val
                      ? 'bg-brand-yellow text-gray-100'
                      : 'text-gray-300 hover:bg-brand-blue/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={filterSeason}
              onChange={e => setFilterSeason(e.target.value)}
              aria-label="Season"
              className="h-8 min-w-0 border border-gray-700 rounded-lg px-2 text-xs text-gray-200 bg-white focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            >
              {availableSeasons.map(s => (
                <option key={s} value={s}>{s}{s === ACTIVE_SEASON ? '' : ' (archive)'}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Feedback toast */}
      {submitFeedback && (
        <div className="mx-4 mt-2 text-center text-green-600 font-medium animate-pulse text-sm">
          {submitFeedback}
        </div>
      )}

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-3">

          {/* ========== PROJECTS VIEW ========== */}
          {/* Reading it as a book: contents first, then a page per meeting.
              The project list is still there for searching and filtering. */}
          {view === 'book' && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => { setView('projects'); setBookProject(null) }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to projects
                </button>
                {bookProject && (
                  <span className="text-xs text-gray-400">
                    {bookProject.name}'s notebook
                  </span>
                )}
              </div>
              {/* A topic's notebook is that topic's entries, read the same way:
                  contents of dates, then a page each. getProjectEntries already
                  applies the season and the own-entries-only rule, so scoping
                  the book can't show anyone more than the folder did.
                  Keyed so switching topics opens at the contents rather than
                  keeping the page you were on in the last one. */}
              <NotebookBook
                key={bookProject?.id || 'all'}
                entries={bookProject ? getProjectEntries(bookProject.id) : filteredEntries}
                projectName={bookProject?.name}
                // The same rule as the list view, passed in rather than
                // re-decided inside the book: your own to edit, your own to
                // delete unless you're a lead.
                canEdit={e => isLead || e.username === username}
                onEdit={e => e.username === username && startEditEntry(e)}
                onDelete={handleDeleteEntry}
              />
            </>
          )}

          {/* ========== PHOTO GALLERY ========== */}
          {/* The same entries the list is showing, as pictures. filteredEntries
              is passed in so the filter bar above filters both, and so does
              "Save all" — see components/NotebookPhotos.jsx. */}
          {view === 'gallery' && (
            <NotebookPhotos
              entries={filteredEntries}
              projects={allDisplayProjects}
              onBack={() => setView('projects')}
            />
          )}

          {view === 'projects' && (
            <>
              {/* Writing is the main thing here, so it gets the full width; the
                  EN Helper icon beside it is the same action, spoken. Reading
                  and projects are quieter and share the row below equally. */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setFormData({ ...INITIAL_ENTRY }); setEditingEntryId(null); setView('entry') }}
                    className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark transition-colors font-semibold text-gray-800"
                  >
                    <Plus size={16} /> New Entry
                  </button>
                  {voiceReady && canSubmitNotebook && (
                    <button
                      onClick={() => setShowHelper(true)}
                      aria-label="Open EN Helper"
                      title="EN Helper: talk instead of type"
                      className="h-11 w-11 shrink-0 rounded-xl overflow-hidden shadow-sm hover:scale-105 active:scale-95 transition-transform"
                    >
                      <img src="/helper/icon-192.png" alt="" className="w-full h-full" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { setBookProject(null); setView('book') }}
                    className="h-9 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white hover:bg-brand-silver/20 transition-colors text-sm font-medium text-gray-600"
                  >
                    <BookOpen size={14} /> Read it
                  </button>
                  <button
                    onClick={() => isLead
                      ? (setProjectForm({ ...INITIAL_PROJECT }), setEditingProjectId(null), setShowProjectModal(true))
                      : setShowRequestProjectModal(true)}
                    className="h-9 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white hover:bg-brand-blue/20 transition-colors text-sm font-medium text-gray-600"
                  >
                    <Plus size={14} /> {isLead ? 'New Project' : 'Request Project'}
                  </button>
                  <button
                    onClick={() => setView('gallery')}
                    className="h-9 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white hover:bg-brand-gold/25 transition-colors text-sm font-medium text-gray-600"
                  >
                    <ImageIcon size={14} /> Photos
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {allDisplayProjects.map(project => {
                  const projectEntries = getProjectEntries(project.id)
                  const isExpanded = expandedProject === project.id
                  const dateGroups = groupByDate(projectEntries)

                  return (
                    <div key={project.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                      <div
                        onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FolderOpen size={18} className="text-brand-blue-dark" />
                          <span className="font-semibold text-gray-800">{project.name}</span>
                          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                            {getProjectCount(project.id)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!project.permanent && isLead && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setProjectForm({ name: project.name, category: project.category || 'Technical', goal: project.goal || '', reason: project.reason || '', status: project.status || 'Active' })
                                  setEditingProjectId(project.id)
                                  setShowProjectModal(true)
                                }}
                                className="text-gray-300 hover:text-brand-blue-dark transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id) }}
                                className="text-gray-300 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setBookProject({ id: project.id, name: project.name })
                              setView('book')
                            }}
                            title={`Read ${project.name} as a notebook`}
                            className="text-gray-300 hover:text-brand-silver-dark transition-colors"
                          >
                            <ArrowRight size={16} />
                          </button>
                          {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t px-4 py-3 space-y-3 bg-gray-50/30">
                          <button
                            onClick={() => handleNewEntryFromProject(project.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-brand-yellow/30 hover:bg-brand-yellow/50 transition-colors text-gray-600"
                          >
                            <Plus size={12} /> Add Entry
                          </button>

                          {dateGroups.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">No entries yet.</p>
                          ) : (
                            dateGroups.map(([date, dateEntries]) => (
                              <div key={date}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <h4 className="text-xs font-semibold text-gray-500">{formatDate(date)}</h4>
                                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">{dateEntries.length}</span>
                                </div>
                                <div className="space-y-2">
                                  {dateEntries.map(entry => {
                                    const engDot = ENGAGEMENT_OPTIONS.find(o => o.value === entry.engagement)?.dot || 'bg-gray-400'
                                    return (
                                      <div key={entry.id} className="bg-white rounded-lg p-3 shadow-sm">
                                        <div className="flex items-start justify-between gap-2">
                                          <span className="flex items-center gap-1 text-xs text-gray-400"
                                                title={entry.engagement_note || undefined}>
                                            <span className={`w-2 h-2 rounded-full inline-block ${engDot}`} />
                                            {entry.engagement}
                                          </span>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {/* Only the person who wrote it. An entry is that person's
                                                own account of what they did — a lead rewriting it would
                                                put words in their mouth. Leads can still delete. */}
                                            {entry.username === username && (
                                              <button
                                                onClick={() => startEditEntry(entry)}
                                                title="Edit this entry"
                                                className="text-gray-300 hover:text-brand-blue-dark transition-colors"
                                              >
                                                <Pencil size={14} />
                                              </button>
                                            )}
                                            {(isLead || entry.username === username) && (
                                              <button onClick={() => handleDeleteEntry(entry)} title="Delete this entry" className="text-gray-300 hover:text-red-400 transition-colors">
                                                <Trash2 size={14} />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        {isVoice(entry) && <div className="mt-1"><VoiceTag /></div>}
                                        <p className="text-sm text-gray-800 mt-1 font-medium">
                                          {isVoice(entry) && entry.complete === false
                                            ? <span className="text-gray-400 font-normal italic">{voiceStatusLine(entry)}</span>
                                            : entry.what_did || (isVoice(entry) && <span className="text-gray-400 font-normal italic">{voiceStatusLine(entry)}</span>)}
                                        </p>
                                        {/* Read on the page, not just as a tooltip — this is the
                                            half of engagement anyone can actually act on. */}
                                        {entry.engagement_note && (
                                          <p className="text-xs text-gray-500 mt-1 italic">“{entry.engagement_note}”</p>
                                        )}
                                        <p className="text-xs mt-1 flex items-start flex-wrap gap-x-1 text-gray-400">
                                          {entry.mentor_help ? (
                                            <>
                                              <GraduationCap size={11} className="text-amber-500 shrink-0 mt-0.5" />
                                              Mentor helped{entry.mentor_name ? ` — ${entry.mentor_name}` : ''}
                                              {entry.mentor_note ? <span className="italic text-gray-400">: {entry.mentor_note}</span> : null}
                                            </>
                                          ) : 'Done on their own'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                          <span className="font-medium">Why:</span> {entry.why_option}
                                          {entry.why_note && <span className="italic"> - {entry.why_note}</span>}
                                        </p>
                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                          {entry.project_link && (
                                            <a href={entry.project_link} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue-dark hover:underline flex items-center gap-0.5">
                                              <ExternalLink size={10} /> Link
                                            </a>
                                          )}
                                          {entry.photo_url && (
                                            <a href={entry.photo_url} target="_blank" rel="noopener noreferrer">
                                              <img src={thumbUrl(entry.photo_url)} alt="Entry photo" loading="lazy" decoding="async" className="mt-1 max-h-32 rounded-lg object-cover" onError={thumbFallback(entry.photo_url, el => { el.style.display = 'none' })} />
                                            </a>
                                          )}
                                        </div>
                                        <div className="mt-2 pt-1.5 border-t border-gray-100">
                                          <span className="text-xs text-gray-400 font-medium">{entry.username}</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

            </>
          )}

          {/* ========== ENTRY FORM VIEW ========== */}
          {view === 'entry' && (
            <div className="space-y-4">
              <button
                onClick={() => setView('projects')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to projects
              </button>
              <SectionHeader title={editingEntryId ? 'Update Entry' : 'New Notebook Entry'} />
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-brand-blue-dark transition-all"
                       style={{ width: `${((step + 1) / (LAST_STEP + 1)) * 100}%` }} />
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">
                  {step + 1} of {LAST_STEP + 1}
                </span>
              </div>
              {editingEntryId && (
                <div className="flex items-center justify-between gap-2 bg-brand-blue/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-600">Editing an entry you already wrote — saving replaces it.</p>
                  <button
                    onClick={() => { setFormData({ ...INITIAL_ENTRY }); setEditingEntryId(null); setMeetingDate(todayLocal()); setStep(0) }}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {step === 0 && (
                <Page title="Which meeting is this for?" sub="Start with the day.">
              {/* Meeting date */}
              <div>
                {/* Anyone can date an entry, not just leads — missing one now
                    marks you absent, so everyone needs a way to make it up.
                    Capped at today: you can't write up a meeting that hasn't
                    happened. */}
                <input
                  type="date"
                  value={meetingDate}
                  max={todayLocal()}
                  onChange={e => setMeetingDate(e.target.value || todayLocal())}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                />
                {/* Say why it's refused, right under the date that caused it. */}
                {blockedDay && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-800 font-semibold">
                      A lead marked you absent for {formatDate(meetingDate)}.
                    </p>
                    <p className="text-[11px] text-red-700 mt-0.5">
                      An entry is what shows you were at a meeting, so it can't be written for a day
                      you were marked down for. Talk to a lead if that's wrong.
                    </p>
                  </div>
                )}
                {meetingDate !== todayLocal() && (
                  <p className="text-xs text-brand-blue-dark mt-1">
                    Writing this up for {formatDate(meetingDate)}, not today.
                  </p>
                )}
                {missingDays.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1">
                      No entry yet for {missingDays.length === 1 ? 'this meeting' : 'these meetings'} — tap one to write it up.
                      If you were marked absent only for missing it, writing it wins that meeting back.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {missingDays.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setMeetingDate(d)}
                          className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                            meetingDate === d
                              ? 'bg-brand-blue text-gray-800 font-semibold'
                              : 'bg-brand-silver/30 hover:bg-brand-silver/50 text-gray-700'
                          }`}
                        >
                          {formatDate(d)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

                </Page>
              )}

              {step === 1 && (
                <Page title="What did you do?" sub="One or two lines is plenty.">
              {/* What did you do */}
              <div>
                <input
                  type="text"
                  value={formData.whatDid}
                  onChange={e => updateField('whatDid', e.target.value.slice(0, 150))}
                  placeholder="Wired the intake motor to REV hub port 2"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  maxLength={150}
                />
                <p className="text-xs text-gray-400 text-right mt-0.5">{formData.whatDid.length}/150</p>
              </div>

                </Page>
              )}

              {step === 2 && (
                <Page title="Why did it matter?" sub="What it moved forward.">
              {/* Why it matters */}
              <div>
                <select
                  value={formData.whyOption}
                  onChange={e => updateField('whyOption', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                >
                  <option value="">Select a reason...</option>
                  {WHY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <input
                  type="text"
                  value={formData.whyNote}
                  onChange={e => updateField('whyNote', e.target.value)}
                  placeholder={formData.whyOption === 'Other' ? 'Required: explain why this matters' : 'Optional: add a short note'}
                  className={`w-full mt-2 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent ${formData.whyOption === 'Other' && !formData.whyNote.trim() ? 'border-red-300' : ''}`}
                />
                {formData.whyOption === 'Other' && !formData.whyNote.trim() && (
                  <p className="text-xs text-red-400 mt-0.5">A note is required when selecting "Other"</p>
                )}
              </div>

                </Page>
              )}

              {step === 3 && (
                <Page title="How engaged were you?" sub="And what made it that way.">
              {/* Engagement */}
              <div>
                <div className="flex gap-2">
                  {ENGAGEMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateField('engagement', opt.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.engagement === opt.value ? 'bg-brand-yellow text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${opt.dot}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
                {!formData.engagement && (
                  <p className="text-xs text-gray-400 mt-1">Pick one — it isn't filled in for you.</p>
                )}
                {/* The level says a meeting went badly; this says what went
                    wrong, which is the part anyone can act on. */}
                {formData.engagement && (
                  <div className="mt-2">
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      Why did you feel {formData.engagement.toLowerCase()} engaged? *
                    </label>
                    <textarea
                      value={formData.engagementNote}
                      onChange={e => updateField('engagementNote', e.target.value)}
                      rows={2}
                      placeholder={
                        formData.engagement === 'Very' ? 'What made it a good one?'
                          : formData.engagement === 'Somewhat' ? 'What would have made it better?'
                          : 'What got in the way?'}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
                    />
                  </div>
                )}
              </div>

                </Page>
              )}

              {step === 4 && (
                <Page title="Which project?" sub="Leave it if this wasn't project work.">
              {/* Project */}
              <div>
                <div className="flex flex-wrap gap-2">
                  {['Technical', 'Business', 'Programming'].map(name => (
                    <button
                      key={name}
                      onClick={() => { updateField('category', name); updateField('projectId', '') }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        formData.category === name && !formData.projectId ? 'bg-brand-yellow text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                  {activeProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { updateField('projectId', p.id); updateField('category', p.category || 'Technical') }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        formData.projectId === p.id ? 'bg-brand-yellow text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

                </Page>
              )}

              {step === 5 && (
                <Page title="Did a mentor help?" sub="Judges care whether the work was student-led.">
              {/* Mentor help — FRC judges care whether the work was student-led,
                  so record it per entry rather than guessing later. */}
              <div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, mentorHelp: false, mentorName: '', mentorNote: '' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !formData.mentorHelp ? 'bg-brand-yellow text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    I did this on my own
                  </button>
                  <button
                    onClick={() => updateField('mentorHelp', true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      formData.mentorHelp ? 'bg-brand-yellow text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <GraduationCap size={14} /> A mentor helped
                  </button>
                </div>
                {formData.mentorHelp && (
                  <>
                    <select
                      value={formData.mentorName}
                      onChange={e => updateField('mentorName', e.target.value)}
                      className="w-full mt-2 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                    >
                      <option value="">Which mentor?</option>
                      {mentors.map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="Someone else">Someone else</option>
                    </select>
                    <textarea
                      value={formData.mentorNote}
                      onChange={e => updateField('mentorNote', e.target.value)}
                      rows={2}
                      placeholder="How did they help? e.g. showed me how to set gear ratios, I did the CAD"
                      className="w-full mt-2 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                    />
                  </>
                )}
              </div>

                </Page>
              )}

              {step === SIGNAL_STEP && (
                <Page
                  title="What happened today?"
                  sub="Tick at least one. We'll only ask follow-up questions about what you tick."
                >
                  <SignalPicker
                    selected={formData.signals || []}
                    onChange={next => updateField('signals', next)}
                  />
                </Page>
              )}

              {/* One page per signal, asking only that signal's questions. */}
              {step > SIGNAL_STEP && step < EVIDENCE_STEP && (() => {
                const sig = chosenSignals[step - SIGNAL_STEP - 1]
                if (!sig) return null
                return (
                  <Page title={`${sig.emoji}  ${sig.label}`} sub={sig.helper}>
                    <SignalQuestions
                      signal={sig}
                      answers={formData.signalData?.[sig.key] || {}}
                      onChange={next => updateField('signalData', {
                        ...(formData.signalData || {}),
                        [sig.key]: next,
                      })}
                    />
                  </Page>
                )
              })()}

              {step === EVIDENCE_STEP && (
                <Page title="Show it" sub="A photo, or a link to the work.">
              {/* Project link (optional) */}
              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">Project link {formData.photoUrl ? '(optional)' : '(required if no photo)'}</label>
                <input
                  type="url"
                  value={formData.projectLink}
                  onChange={e => updateField('projectLink', e.target.value)}
                  placeholder="GitHub PR, Google Doc, etc."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                />
              </div>

              {/* Photo upload (optional) */}
              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">Photo/Screenshot {formData.projectLink.trim() ? '(optional)' : '(required if no link)'}</label>
                {formData.photoUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={formData.photoUrl}
                      alt="Preview"
                      className="max-h-40 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => updateField('photoUrl', '')}
                      className="absolute -top-2 -right-2 bg-white rounded-full shadow p-0.5 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-200 hover:border-brand-blue cursor-pointer transition-colors">
                    <Camera size={18} className="text-gray-400" />
                    <span className="text-sm text-gray-400">Tap to add a photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        // Clear the input straight away, so picking the same
                        // file again after a failure still fires onChange.
                        e.target.value = ''
                        if (!file) return
                        // Every path out of here has to clear _uploading. It
                        // previously only cleared on success, so a photo the
                        // browser couldn't decode (an iPhone HEIC on Chrome,
                        // most often) left the spinner going forever and the
                        // Submit button disabled with nothing to explain why.
                        // The upload itself lives in lib/notebookPhoto.js,
                        // shared with the EN Helper.
                        setFormData(prev => ({ ...prev, _uploading: true, _photoError: '' }))
                        uploadNotebookPhoto(file)
                          .then(url => setFormData(prev => ({ ...prev, photoUrl: url, _uploading: false, _photoError: '' })))
                          .catch(err => setFormData(prev => ({ ...prev, _uploading: false, _photoError: err.message })))
                      }}
                    />
                    {formData._uploading && (
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
                        <Loader2 size={16} className="animate-spin text-brand-blue-dark" />
                        Uploading…
                      </span>
                    )}
                  </label>
                )}
                {formData._photoError && (
                  <p className="text-xs text-red-500 mt-1.5">{formData._photoError}</p>
                )}
              </div>

              {/* The thread between one meeting and the next. Deliberately not
                  wired to tasks — a half-formed "we should probably retest
                  this" is worth writing down long before it is worth
                  assigning to anybody. */}
              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">
                  What should happen next? <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.nextStep || ''}
                  onChange={e => updateField('nextStep', e.target.value)}
                  placeholder="Where you'd pick this up next meeting"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                />
              </div>

                </Page>
              )}

              {/* One page at a time. The whole form on one screen was a wall;
                  a notebook asks you one thing, you answer it, you turn over. */}
              <div className="flex items-center gap-2 pt-1">
                {step > 0 && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    ← Back
                  </button>
                )}
                {step < LAST_STEP ? (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    disabled={!stepReady}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-brand-blue hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                ) : (
                  <div className="flex-1">
              {/* Submit — say what's still missing rather than just greying out */}
              {(() => {
                const missing = [
                  !formData.whatDid.trim() && 'what you did',
                  !formData.whyOption && 'why it mattered',
                  formData.whyOption === 'Other' && !formData.whyNote.trim() && 'a note for "Other"',
                  formData._uploading && 'the photo to finish uploading',
                  !formData._uploading && !formData.photoUrl && !formData.projectLink.trim() && 'a photo or a project link',
                  !formData.engagement && 'how engaged you were',
                  formData.engagement && !formData.engagementNote.trim() && 'why you felt that way',
                  !(formData.signals || []).length && 'at least one thing that happened today',
                ].filter(Boolean)
                return (
                  <>
                    {missing.length > 0 && (
                      <p className="text-xs text-gray-400 text-center">
                        Still needed: {missing.join(' · ')}
                      </p>
                    )}
                    <button
                      onClick={handleSubmitEntry}
                      disabled={missing.length > 0 || blockedDay || saving || formData._uploading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving
                        ? <><Loader2 size={18} className="animate-spin" /> Saving…</>
                        : <><Send size={18} /> {editingEntryId ? 'Update Entry' : 'Submit Entry'}</>}
                    </button>
                  </>
                )
              })()}
                  </div>
                )}
              </div>
            </div>
          )}


        </div>
      </main>

      {/* ========== MODALS ========== */}

      {/* Project modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">{editingProjectId ? 'Edit Project' : 'New Project'}</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <input
              type="text"
              value={projectForm.name}
              onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Project name"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
            <select
              value={projectForm.category}
              onChange={e => setProjectForm(p => ({ ...p, category: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            >
              {CATEGORIES.filter(c => c !== 'Custom').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea
              value={projectForm.goal}
              onChange={e => setProjectForm(p => ({ ...p, goal: e.target.value }))}
              placeholder="What's the goal?"
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
            />
            <textarea
              value={projectForm.reason}
              onChange={e => setProjectForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Why is this important?"
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
            />
            {editingProjectId && (
              <select
                value={projectForm.status}
                onChange={e => setProjectForm(p => ({ ...p, status: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              >
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
              </select>
            )}
            <button
              onClick={handleSubmitProject}
              disabled={!projectForm.name.trim()}
              className="w-full py-2 rounded-lg font-medium bg-brand-yellow hover:bg-brand-yellow-dark transition-colors disabled:opacity-40"
            >
              {editingProjectId ? 'Update Project' : 'Create Project'}
            </button>
          </div>
        </div>
      )}

      {/* Request project modal (teammates) */}
      {showRequestProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRequestProjectModal(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Request a Project</h3>
              <button onClick={() => setShowRequestProjectModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400">Your request will be reviewed by a team lead.</p>
            <input
              type="text"
              value={requestProjectName}
              onChange={e => setRequestProjectName(e.target.value)}
              placeholder="Project name"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              autoFocus
            />
            <button
              onClick={handleRequestProject}
              disabled={!requestProjectName.trim()}
              className="w-full py-2 rounded-lg font-medium bg-brand-yellow hover:bg-brand-yellow-dark transition-colors disabled:opacity-40"
            >
              Submit Request
            </button>
          </div>
        </div>
      )}

      {showHelper && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white">
            <button
              onClick={() => setShowHelper(false)}
              className="flex items-center gap-1 text-sm font-semibold text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100"
            >
              ← Back to Notebook
            </button>
          </div>
          {/* The Helper's own recorder, run here rather than in a frame: a
              second copy of the app would fight this one over the sign-in. */}
          <div className="flex-1 overflow-y-auto">
            <Suspense fallback={<div className="flex justify-center pt-24 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>}>
              <HelperRecorder embedded />
            </Suspense>
          </div>
        </div>
      )}

      {editingVoice && (
        <VoiceEntryEditor
          entry={editingVoice}
          onClose={() => setEditingVoice(null)}
          onSaved={updated => setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, polished: updated.polished } : e))}
        />
      )}
    </div>
  )
}
