// The two people every idea goes to.
//
// Suggestions and the idea boxes on the "not built yet" pages are about the
// app, and the app has two owners — Kayden and Yukti — whichever team the
// idea came from. A sister team's Co-Founder tag means something on their
// team; it does not make them a reviewer of app ideas. So the reviewer list
// is these two names, matched the same way the permissions do, and nothing
// to do with team or tag.
export const PERMANENT_COFOUNDERS = ['yukti', 'kayden']

export const isPermanentCofounderName = (name) =>
  !!name && PERMANENT_COFOUNDERS.some(n => String(name).toLowerCase().includes(n))

// Profile ids to notify about a new idea, from every team. Nothing on
// failure: a missed ping is better than a thrown submit.
export async function ideaReviewerIds(supabaseUrl, headers) {
  try {
    const or = PERMANENT_COFOUNDERS.map(n => `display_name.ilike.*${n}*`).join(',')
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,display_name&or=(${or})`, { headers })
    if (!res.ok) return []
    const rows = await res.json()
    return (Array.isArray(rows) ? rows : [])
      .filter(p => isPermanentCofounderName(p.display_name))
      .map(p => p.id)
  } catch { return [] }
}
