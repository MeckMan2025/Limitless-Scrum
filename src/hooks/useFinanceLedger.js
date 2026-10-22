import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'

// Finance ledger — one JSON doc (scouting_schedule row id='finance_ledger'),
// same no-table pattern as the role trackers. Anon REST + realtime.
//
// Shape:
//   startingBalance  number  — carried in from before the app tracked money
//   budgetTarget     number  — season budget the meter counts down from
//   transactions     [{ id, date:'YYYY-MM-DD', desc, amount, kind:'income'|'expense', by, at }]
//   upcoming         [{ id, text, amount, due:'YYYY-MM-DD', done }]
//
// Tiles (balance / raised / spent / remaining) are DERIVED from transactions,
// never stored — so they can't drift out of agreement with each other.
const DOC_ID = 'finance_ledger'

// budgetTarget 0 = not set yet — the Business Lead enters it in-app.
const EMPTY = { startingBalance: 0, budgetTarget: 0, transactions: [], upcoming: [] }

export function useFinanceLedger() {
  const [ledger, setLedger] = useState(null) // null = loading
  const ref = useRef(EMPTY)
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders({ 'Content-Type': 'application/json' })

  const apply = (doc) => { ref.current = doc; setLedger(doc) }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${DOC_ID}&select=data`, { headers })
        if (res.ok) {
          const rows = await res.json()
          const d = rows?.[0]?.data
          apply(d && typeof d === 'object' ? { ...EMPTY, ...d } : EMPTY)
        } else apply(EMPTY)
      } catch { apply(EMPTY) }
    })()
    const ch = supabase
      .channel('finance-ledger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === DOC_ID && p.new?.data) apply({ ...EMPTY, ...p.new.data })
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (next) => {
    apply(next)
    try {
      await fetch(`${url}/rest/v1/scouting_schedule`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
        body: JSON.stringify({ id: DOC_ID, data: next }),
      })
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch) => persist({ ...ref.current, ...patch }), [persist])

  return { ledger: ledger || EMPTY, loading: ledger === null, update }
}
