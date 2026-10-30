import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { restHeaders } from './restHeaders'

// A small settings document that belongs to the whole team: one row in
// scouting_schedule (the same place the team-wide app settings live), read by
// every account on every computer, and pushed to all of them the moment it
// changes. This device keeps a copy in localStorage so the screen is right
// before the first answer arrives.
//
//   const doc = teamDoc('feature_switches', 'scrum-features')
//   doc.get()            the current value (an object; {} until known)
//   doc.set(next)        replace it, here and for everyone
//   doc.use()            the value, in a component, kept current
//
// Used by the feature switches (features.js) and the home screen's widgets
// (homeWidgets.js).

const url = import.meta.env.VITE_SUPABASE_URL

export function teamDoc(docId, cacheKey) {
  const listeners = new Set()

  const get = () => {
    try { return JSON.parse(localStorage.getItem(cacheKey) || '{}') || {} } catch { return {} }
  }

  const apply = (value) => {
    try { localStorage.setItem(cacheKey, JSON.stringify(value || {})) } catch { /* ignore */ }
    listeners.forEach(l => l())
  }

  // Read it once and keep listening, for as long as the app is open. Started by
  // the first screen that asks; again after signing in, since before that the
  // database answers nobody.
  let syncing = null
  let channel = null
  const startSync = () => {
    if (syncing) return syncing
    syncing = (async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?id=eq.${docId}&select=data`, { headers: restHeaders() })
        if (!res.ok) { syncing = null; return }
        const rows = await res.json()
        if (rows[0]?.data) apply(rows[0].data)
      } catch { syncing = null; return }
      if (!channel) {
        channel = supabase
          .channel(`team-doc-${docId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule', filter: `id=eq.${docId}` }, (p) => {
            if (p.new?.data) apply(p.new.data)
          })
          .subscribe()
      }
    })()
    return syncing
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') { syncing = null; startSync() }
  })

  const set = async (next) => {
    apply(next)
    try {
      await fetch(`${url}/rest/v1/scouting_schedule`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates, return=minimal' }),
        body: JSON.stringify({ id: docId, data: next }),
      })
    } catch { /* offline: this device keeps it, and the next change carries it */ }
  }

  const use = () => {
    const [value, setValue] = useState(get)
    useEffect(() => {
      const update = () => setValue(get())
      listeners.add(update)
      const onStorage = (e) => { if (e.key === cacheKey || e.key === null) update() }
      window.addEventListener('storage', onStorage)
      startSync()
      return () => { listeners.delete(update); window.removeEventListener('storage', onStorage) }
    }, [])
    return value
  }

  return { get, set, use }
}
