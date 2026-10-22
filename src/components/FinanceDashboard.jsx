import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useFinanceLedger } from '../hooks/useFinanceLedger'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../contexts/UserContext'
import { SIDE_THEME } from '../data/roleTrackers'
import { ACTIVE_SEASON } from '../data/season'

// Finance role dashboard. Balance / raised / spent / remaining are DERIVED from
// dated ledger entries — you record money in or out, the tiles do the math, so
// the numbers always agree and every value has a who/when behind it.

const theme = SIDE_THEME.business

const money = (n) => {
  const v = Number(n) || 0
  const s = Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(v) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${v < 0 ? '-' : ''}$${s}`
}

// Seasons roll over May 1 (matches data/season.js). '2026-2027' -> 2026-05-01.
const seasonCutoff = () => `${ACTIVE_SEASON.split('-')[0]}-05-01`

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const prettyDate = (key) => {
  const [y, m, d] = (key || '').split('-').map(Number)
  return (y && m && d)
    ? new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
}

const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function Tile({ label, value, negative }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${theme.tile}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 leading-tight">{label}</p>
      <p className={`text-[26px] leading-none font-semibold mt-1 ${negative ? 'text-red-500' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

export default function FinanceDashboard({ editable = false, publicOnly = false }) {
  const { ledger, loading, update } = useFinanceLedger()
  const { hasLeadTag, canSetBudget } = usePermissions()
  const { username } = useUser()

  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState('expense')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [addingUp, setAddingUp] = useState(false)
  const [upText, setUpText] = useState('')
  const [upAmount, setUpAmount] = useState('')
  const [upDue, setUpDue] = useState('')
  const [config, setConfig] = useState(false)

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading ledger…</p>

  const txns = ledger.transactions || []
  const cutoff = seasonCutoff()
  const season = txns.filter(t => (t.date || '') >= cutoff)
  const raised = season.filter(t => t.kind === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const spent = season.filter(t => t.kind === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const allIn = txns.filter(t => t.kind === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const allOut = txns.filter(t => t.kind === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const balance = (Number(ledger.startingBalance) || 0) + allIn - allOut
  const target = Number(ledger.budgetTarget) || 0
  const remaining = target - spent
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((remaining / target) * 100))) : 0

  const recent = [...txns].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || 0) - (a.at || 0)).slice(0, 8)
  const upcoming = ledger.upcoming || []

  const addTxn = () => {
    const amt = parseFloat(amount)
    if (!desc.trim() || !amt || amt <= 0) return
    update({
      transactions: [...txns, { id: uid(), date: todayKey(), desc: desc.trim(), amount: amt, kind, by: username, at: Date.now() }],
    })
    setDesc(''); setAmount(''); setAdding(false)
  }

  const removeTxn = (id) => update({ transactions: txns.filter(t => t.id !== id) })

  const addUpcoming = () => {
    const amt = parseFloat(upAmount)
    if (!upText.trim()) return
    update({ upcoming: [...upcoming, { id: uid(), text: upText.trim(), amount: amt > 0 ? amt : 0, due: upDue, done: false }] })
    setUpText(''); setUpAmount(''); setUpDue(''); setAddingUp(false)
  }

  const toggleUpcoming = (id) => update({ upcoming: upcoming.map(u => u.id === id ? { ...u, done: !u.done } : u) })
  const removeUpcoming = (id) => update({ upcoming: upcoming.filter(u => u.id !== id) })

  return (
    <div className="space-y-3">
      {/* Derived money tiles — no direct editing, the ledger below feeds them */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile label="💵 Current Balance" value={money(balance)} negative={balance < 0} />
        <Tile label="📈 Raised This Season" value={money(raised)} />
        <Tile label="🧾 Spent This Season" value={money(spent)} />
      </div>

      {/* Budget remaining meter. target 0 = the Business Lead hasn't entered a
          budget yet, so show that honestly instead of a meter full of made-up math. */}
      <div className="rounded-xl px-3 py-2.5 bg-white border border-gray-100">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">💰 Budget Remaining</p>
          {target > 0 && <span className="text-xs text-gray-400">{pct}%</span>}
        </div>
        {target > 0 ? (
          <>
            <p className={`text-lg font-semibold ${remaining < 0 ? 'text-red-500' : 'text-gray-800'}`}>
              {money(remaining)} <span className="text-xs font-normal text-gray-400">of {money(target)}</span>
            </p>
            <div className={`mt-1 h-2 rounded-full overflow-hidden ${theme.track}`}>
              <div className={`h-full rounded-full ${remaining < 0 ? 'bg-red-400' : theme.bar} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm italic text-gray-400">
            Not set yet — {canSetBudget ? 'enter the season budget below' : 'the Business Lead enters this'}
          </p>
        )}
        {canSetBudget && (
          <button onClick={() => setConfig(c => !c)} className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-600">
            {config ? 'Hide settings' : 'Starting balance / budget…'}
          </button>
        )}
        {config && canSetBudget && (
          <div className="mt-2 flex gap-2">
            <label className="flex-1 text-[11px] text-gray-500">
              Starting balance
              <input
                type="number"
                defaultValue={ledger.startingBalance}
                onBlur={e => update({ startingBalance: parseFloat(e.target.value) || 0 })}
                className="mt-0.5 w-full text-sm border border-gray-100 rounded-lg px-2 py-1"
              />
            </label>
            <label className="flex-1 text-[11px] text-gray-500">
              Season budget
              <input
                type="number"
                defaultValue={ledger.budgetTarget}
                onBlur={e => update({ budgetTarget: parseFloat(e.target.value) || 0 })}
                className="mt-0.5 w-full text-sm border border-gray-100 rounded-lg px-2 py-1"
              />
            </label>
          </div>
        )}
      </div>

      {!publicOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Upcoming expenses */}
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-700">📅 Upcoming Expenses</h4>
              {editable && (
                <button onClick={() => setAddingUp(a => !a)} className="p-1 rounded hover:bg-gray-100" title="Add upcoming expense">
                  <Plus size={14} className="text-gray-400" />
                </button>
              )}
            </div>
            {upcoming.length === 0 && !addingUp && <p className="text-xs italic text-gray-300">Nothing planned</p>}
            <div className="space-y-1">
              {upcoming.map(u => (
                <div key={u.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={!!u.done} disabled={!editable} onChange={() => toggleUpcoming(u.id)} className="accent-brand-silver-dark shrink-0" />
                  <span className={`text-sm flex-1 ${u.done ? 'line-through text-gray-300' : 'text-gray-600'}`}>{u.text}</span>
                  {u.due && <span className="text-[10px] text-gray-400 shrink-0">{prettyDate(u.due)}</span>}
                  {u.amount > 0 && <span className="text-xs font-semibold text-gray-500 shrink-0">{money(u.amount)}</span>}
                  {editable && (
                    <button onClick={() => removeUpcoming(u.id)} className="opacity-0 group-hover:opacity-100 p-0.5" title="Remove">
                      <X size={12} className="text-gray-300 hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {addingUp && editable && (
              <div className="mt-2 space-y-1.5">
                <input value={upText} onChange={e => setUpText(e.target.value)} placeholder="What for" autoFocus className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1" />
                <div className="flex gap-1.5">
                  <input type="number" value={upAmount} onChange={e => setUpAmount(e.target.value)} placeholder="Est. $" className="w-24 text-sm border border-gray-100 rounded-lg px-2 py-1" />
                  <input type="date" value={upDue} onChange={e => setUpDue(e.target.value)} className="flex-1 min-w-0 text-sm border border-gray-100 rounded-lg px-2 py-1" />
                  <button onClick={addUpcoming} className="shrink-0 px-3 text-sm font-semibold bg-brand-silver/40 hover:bg-brand-silver rounded-lg">Add</button>
                </div>
              </div>
            )}
          </div>

          {/* Recent activity — the ledger itself */}
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-700">🕘 Recent Activity</h4>
              {editable && (
                <button onClick={() => setAdding(a => !a)} className="p-1 rounded hover:bg-gray-100" title="Record money in / out">
                  <Plus size={14} className="text-gray-400" />
                </button>
              )}
            </div>
            {adding && editable && (
              <div className="mb-2 space-y-1.5">
                <div className="flex gap-1">
                  <button onClick={() => setKind('expense')} className={`flex-1 text-xs font-semibold py-1 rounded-lg ${kind === 'expense' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>Money out</button>
                  <button onClick={() => setKind('income')} className={`flex-1 text-xs font-semibold py-1 rounded-lg ${kind === 'income' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Money in</button>
                </div>
                <div className="flex gap-1.5">
                  <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={kind === 'income' ? 'e.g. Sponsor donation' : 'e.g. Motor order'} autoFocus className="flex-1 min-w-0 text-sm border border-gray-100 rounded-lg px-2 py-1" />
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$" className="w-20 text-sm border border-gray-100 rounded-lg px-2 py-1" />
                  <button onClick={addTxn} className="shrink-0 px-3 text-sm font-semibold bg-brand-silver/40 hover:bg-brand-silver rounded-lg">Add</button>
                </div>
              </div>
            )}
            {recent.length === 0 && !adding && <p className="text-xs italic text-gray-300">No activity yet — add money in or out</p>}
            <div className="divide-y divide-gray-50">
              {recent.map(t => (
                <div key={t.id} className="py-1.5 flex items-center gap-2 group">
                  <span className="text-[10px] text-gray-400 w-12 shrink-0">{prettyDate(t.date)}</span>
                  <span className="text-sm text-gray-600 flex-1 truncate" title={t.by ? `by ${t.by}` : undefined}>{t.desc}</span>
                  <span className={`text-sm font-semibold shrink-0 ${t.kind === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                    {t.kind === 'income' ? '+' : '−'}{money(t.amount)}
                  </span>
                  {hasLeadTag && (
                    <button onClick={() => removeTxn(t.id)} className="opacity-0 group-hover:opacity-100 p-0.5" title="Remove entry (leads only)">
                      <X size={12} className="text-gray-300 hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
