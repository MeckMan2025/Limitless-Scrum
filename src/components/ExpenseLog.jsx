import { useState, useEffect } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { teamScope, stampTeam } from '../lib/teamScope'
import { Receipt, Plus, X, Loader2, ExternalLink, Trash2, Check, Pencil } from 'lucide-react'
import { Field, inputClass as input, todayLocal, prettyDate, newId } from './logForm'

const RECEIPT_BUCKET = 'expense-receipts'
const TEAMS = ['Programming', 'Business', 'Technical', 'Other']

// Straight to the storage REST API with the anon key, like the notebook's
// photos. supabase.storage.upload() runs auth.getSession() first, and on a
// phone waking up with an expired token that can hang forever — the upload
// never goes out and Submit stays stuck.
const UPLOAD_TIMEOUT_MS = 20000
async function uploadReceipt(supabaseUrl, supabaseKey, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5)
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${RECEIPT_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        ...restHeaders(),
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: file,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text().catch(() => '')}`)
    return `${supabaseUrl}/storage/v1/object/public/${RECEIPT_BUCKET}/${path}`
  } finally {
    clearTimeout(timer)
  }
}

const BLANK = {
  purchase_date: todayLocal(),
  item: '',
  quantity: '1',
  cost: '',
  store: '',
  team: '',
  team_other: '',
  reimbursement: '',
}

const money = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : ''

export default function ExpenseLog() {
  const { username } = useUser()
  // Marking a row as copied into the spreadsheet is finance's job, so it is
  // whoever already deals with the money: a Finance role, the Business Lead,
  // or a full lead. Everyone else sees the state without being able to change
  // it, which is the point — you need to know whether it has been done.
  const { canOrganizeNotebook: isLead, canViewFinanceTabs: canMarkSheet, myTeamNumber } = usePermissions()
  // One rule for whose rows these are — see lib/teamScope.js.
  const SCOPE = teamScope(myTeamNumber)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  // The row being changed, when the form is open to fix one rather than add
  // one. Its receipt stays unless a new file is chosen.
  const [editId, setEditId] = useState(null)
  const [existingReceipt, setExistingReceipt] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/expense_log?${SCOPE}&select=*&order=purchase_date.desc,created_at.desc`,
          { headers },
        )
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        if (alive) setRows(data)
      } catch (err) {
        // The table may not exist yet — the log reads as empty rather than
        // breaking the page.
        console.error('Failed to load expenses:', err)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  // Tick or untick "in the spreadsheet". Optimistic, and put back if the save
  // fails — getting this wrong in either direction causes a double entry or a
  // missing one, so it should never silently disagree with the database.
  const toggleSheet = async (row) => {
    if (!canMarkSheet) return
    const next = !row.in_spreadsheet
    const before = rows
    setRows(prev => prev.map(r => r.id === row.id
      ? { ...r, in_spreadsheet: next, spreadsheet_by: next ? username : null,
          spreadsheet_at: next ? new Date().toISOString() : null }
      : r))
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/expense_log?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          in_spreadsheet: next,
          spreadsheet_by: next ? username : null,
          spreadsheet_at: next ? new Date().toISOString() : null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Could not update the spreadsheet mark:', err)
      setRows(before)
    }
  }

  const canRemoveAny = rows.some(r => isLead || r.username === username)

  // Open the form on an existing row. Numbers come back as strings because
  // that is what the inputs hold; reimbursement is stored as a boolean.
  const startEdit = (r) => {
    setForm({
      purchase_date: r.purchase_date || todayLocal(),
      item: r.item || '',
      quantity: r.quantity == null ? '1' : String(r.quantity),
      cost: r.cost == null ? '' : String(r.cost),
      store: r.store || '',
      team: r.team || '',
      team_other: r.team_other || '',
      reimbursement: r.reimbursement ? 'Yes' : 'No',
    })
    setFile(null)
    setExistingReceipt(r.receipt_url || null)
    setEditId(r.id)
    setError('')
    setShowForm(true)
    window.scrollTo(0, 0)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditId(null)
    setExistingReceipt(null)
    setFile(null)
    setForm({ ...BLANK })
    setError('')
  }

  // Cost is per item, so the line total is the product. Shown while you type
  // rather than asked for, so the two can't disagree.
  const lineTotal = (Number(form.quantity) || 0) * (Number(form.cost) || 0)
  // What the log adds up to. Rows filed before cost existed count as nothing
  // rather than breaking the sum.
  const spentTotal = rows.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0)

  // The form's own rule: a receipt is required when reimbursement is needed.
  const needsReceipt = form.reimbursement === 'Yes'
  const ready =
    form.purchase_date &&
    form.item.trim() &&
    Number(form.quantity) > 0 &&
    form.cost !== '' && Number(form.cost) >= 0 &&
    form.store.trim() &&
    form.team &&
    (form.team !== 'Other' || form.team_other.trim()) &&
    form.reimbursement &&
    (!needsReceipt || !!file || !!existingReceipt)

  const submit = async () => {
    if (!ready || saving) return
    setSaving(true)
    setError('')
    try {
      let receipt_url = editId ? existingReceipt : null
      if (file) receipt_url = await uploadReceipt(supabaseUrl, supabaseKey, file)

      if (editId) {
        // A fix to a row that is already there. Who logged it and whose team
        // it belongs to don't change; total_cost is worked out by the database.
        const patch = {
          purchase_date: form.purchase_date,
          item: form.item.trim(),
          quantity: Number(form.quantity),
          cost: Number(form.cost),
          store: form.store.trim(),
          team: form.team,
          team_other: form.team === 'Other' ? form.team_other.trim() : null,
          reimbursement: form.reimbursement === 'Yes',
          receipt_url,
        }
        const res = await fetch(`${supabaseUrl}/rest/v1/expense_log?id=eq.${editId}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error(await res.text())
        const [written] = await res.json().catch(() => [])
        setRows(prev => prev.map(r => r.id === editId ? (written || { ...r, ...patch, total_cost: lineTotal }) : r))
        closeForm()
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        return
      }

      const row = {
        id: newId(),
        // Whose row this is. Radical rows stay unstamped, which is NULL.
        ...stampTeam({}, myTeamNumber),
        username,
        purchase_date: form.purchase_date,
        item: form.item.trim(),
        quantity: Number(form.quantity),
        cost: Number(form.cost),
        store: form.store.trim(),
        team: form.team,
        team_other: form.team === 'Other' ? form.team_other.trim() : null,
        reimbursement: form.reimbursement === 'Yes',
        receipt_url,
      }

      const res = await fetch(`${supabaseUrl}/rest/v1/expense_log`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(await res.text())
      const [written] = await res.json().catch(() => [])

      setRows(prev => [written || { ...row, total_cost: lineTotal }, ...prev])
      closeForm()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to log expense:', err)
      setError('That didn’t save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    const keep = rows
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/expense_log?id=eq.${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to remove expense:', err)
      setRows(keep) // put it back rather than letting it look deleted
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-start justify-between gap-2 text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Expense Log
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Log ALL team expenses here{rows.length > 0 && ` · ${money(spentTotal)} spent`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-gray-200">
            {/* Deleting lives behind the pencil rather than sitting on every
                row. A bin beside each one is easy to hit by accident, and
                most of the time you are here to read, not to tidy. */}
            {canRemoveAny && (
              <button
                onClick={() => setEditing(v => !v)}
                title={editing ? 'Done' : 'Edit the log'}
                className={`p-1.5 rounded-lg transition-colors ${
                  editing ? 'bg-brand-yellow text-gray-100' : 'text-gray-400 hover:bg-brand-blue/30'
                }`}
              >
                {editing ? <Check size={15} /> : <Pencil size={15} />}
              </button>
            )}
            <button
              onClick={() => { if (showForm) closeForm(); else { setShowForm(true); setError('') } }}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-brand-yellow hover:bg-brand-yellow-dark transition-colors font-medium"
            >
              {showForm ? <><X size={14} /> Close</> : <><Plus size={14} /> Log an expense</>}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-3">

          {saved && (
            <div className="flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium">
              <Check size={15} /> {editId === null ? 'Saved.' : 'Logged.'}
            </div>
          )}

          {/* ── The form ─────────────────────────────────────────────────── */}
          {showForm && (
            <div className="space-y-3">
              {editId && (
                <div className="flex items-center justify-between gap-2 bg-brand-blue/20 border border-brand-blue/40 rounded-xl px-3 py-2 text-sm text-gray-700">
                  <span className="flex items-center gap-1.5"><Pencil size={14} /> Editing this expense</span>
                  <button onClick={closeForm} className="text-xs text-gray-500 hover:text-gray-800 underline">Cancel</button>
                </div>
              )}
              <Field label="Date of Purchase" required>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={e => set('purchase_date', e.target.value)}
                  className={input}
                />
              </Field>

              <Field label="What item was purchased?" required>
                <input
                  type="text"
                  value={form.item}
                  onChange={e => set('item', e.target.value)}
                  placeholder="Your answer"
                  className={input}
                />
              </Field>

              <Field label="How many?" required>
                <input type="number" min="1" step="1" value={form.quantity}
                       onChange={e => set('quantity', e.target.value)}
                       placeholder="1" className={input} />
              </Field>

              <Field label="Cost per item" required>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-400">$</span>
                  <input type="number" min="0" step="0.01" value={form.cost}
                         onChange={e => set('cost', e.target.value)}
                         placeholder="0.00" className={input} />
                </div>
                {Number(form.quantity) > 1 && lineTotal > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    {form.quantity} × {money(form.cost)} = <span className="font-semibold text-gray-700">{money(lineTotal)}</span>
                  </p>
                )}
              </Field>

              <Field label="Link or name of store purchased from" required>
                <input
                  type="text"
                  value={form.store}
                  onChange={e => set('store', e.target.value)}
                  placeholder="Your answer"
                  className={input}
                />
              </Field>

              <Field label="What team was the purchase for?" required>
                <div className="space-y-2">
                  {TEAMS.map(t => (
                    <label key={t} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-600">
                      <input
                        type="radio"
                        name="team"
                        checked={form.team === t}
                        onChange={() => set('team', t)}
                        className="accent-brand-yellow-dark w-4 h-4"
                      />
                      {t === 'Other' ? (
                        <span className="flex items-center gap-2 flex-1">
                          Other:
                          <input
                            type="text"
                            value={form.team_other}
                            onChange={e => { set('team_other', e.target.value); set('team', 'Other') }}
                            className="flex-1 border-b border-dotted border-gray-300 text-sm focus:outline-none focus:border-brand-blue-dark bg-transparent"
                          />
                        </span>
                      ) : t}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Is reimbursement needed?" required>
                <div className="space-y-2">
                  {['Yes', 'No'].map(v => (
                    <label key={v} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-600">
                      <input
                        type="radio"
                        name="reimbursement"
                        checked={form.reimbursement === v}
                        onChange={() => set('reimbursement', v)}
                        className="accent-brand-yellow-dark w-4 h-4"
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label={`Upload image of receipt${needsReceipt ? '' : ' (optional unless reimbursement is needed)'}`} required={needsReceipt}>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-blue/30 file:text-gray-700 hover:file:bg-brand-blue/50 file:cursor-pointer"
                />
                {existingReceipt && !file && (
                  <p className="text-xs text-gray-500 mt-2">
                    Keeping the{' '}
                    <a href={existingReceipt} target="_blank" rel="noopener noreferrer" className="text-brand-blue-dark hover:underline">current receipt</a>
                    {' '}— choose a file to replace it.
                  </p>
                )}
                {needsReceipt && !file && !existingReceipt && (
                  <p className="text-xs text-brand-yellow-dark mt-2">
                    A receipt is required to be reimbursed.
                  </p>
                )}
              </Field>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <button
                onClick={submit}
                disabled={!ready || saving}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark disabled:bg-gray-100 disabled:text-gray-400 transition-colors font-medium text-gray-800"
              >
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : (editId ? 'Save changes' : 'Submit')}
              </button>
            </div>
          )}

          {/* ── The log ──────────────────────────────────────────────────── */}
          {!showForm && (
            loading ? (
              <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
            ) : rows.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <Receipt size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">Nothing logged yet.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Log an expense and it shows up here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {r.item}
                          {Number(r.quantity) > 1 && (
                            <span className="text-gray-400 font-normal"> × {r.quantity}</span>
                          )}
                        </p>
                        {r.total_cost != null && (
                          <p className="text-sm font-semibold text-gray-700 mt-0.5">
                            {money(r.total_cost)}
                            {Number(r.quantity) > 1 && (
                              <span className="text-xs font-normal text-gray-400"> ({money(r.cost)} each)</span>
                            )}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {prettyDate(r.purchase_date)}
                          <span className="mx-1.5 text-gray-300">·</span>
                          {r.store}
                          <span className="mx-1.5 text-gray-300">·</span>
                          {r.team === 'Other' ? (r.team_other || 'Other') : r.team}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Logged by {r.username}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Whether this row has been carried into the finance
                            spreadsheet. Readable by everyone, changeable by
                            the people who keep the sheet. */}
                        <button
                          type="button"
                          onClick={() => toggleSheet(r)}
                          disabled={!canMarkSheet}
                          title={r.in_spreadsheet
                            ? `In the spreadsheet${r.spreadsheet_by ? ` — ${r.spreadsheet_by}` : ''}`
                            : (canMarkSheet ? 'Mark as added to the spreadsheet' : 'Not in the spreadsheet yet')}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                            r.in_spreadsheet
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                          } ${canMarkSheet ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}
                        >
                          {r.in_spreadsheet ? '✓ Sheet' : 'Not in sheet'}
                        </button>
                        {r.reimbursement && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-silver/40 text-gray-700">
                            Reimburse
                          </span>
                        )}
                        {r.receipt_url && (
                          <a
                            href={r.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-blue-dark hover:underline flex items-center gap-1"
                          >
                            <ExternalLink size={12} /> Receipt
                          </a>
                        )}
                        {/* Your own mistakes, and a lead can fix or clear anyone's. */}
                        {editing && (isLead || r.username === username) && (
                          <button
                            onClick={() => startEdit(r)}
                            className="text-gray-300 hover:text-brand-blue-dark transition-colors"
                            title="Edit this expense"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {editing && (isLead || r.username === username) && (
                          <button
                            onClick={() => remove(r.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                            title="Remove this expense"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  )
}
