// Hosting and voting for a decision matrix.
//
// The session lives under a reserved key inside the existing `scores` jsonb
// rather than in new columns, so this needs no migration on design_matrices.
// A matrix's own scores stay alongside it untouched.

export const SESSION_KEY = '__session'

export const getSession = (m) => (m?.scores || {})[SESSION_KEY] || null
export const ownScores = (scores) => {
  const n = { ...(scores || {}) }
  delete n[SESSION_KEY]
  return n
}
export const withSession = (scores, session) => {
  const n = ownScores(scores)
  if (session) n[SESSION_KEY] = session
  return n
}

// Who has already watched the reveal. This lives on the session rather than in
// localStorage because it is about a person, not a browser: the same account on
// a phone, or after clearing site data, had already seen it.
export const hasSeenReveal = (session, name) =>
  !!name && (session?.seenBy || []).includes(name)

export const withSeen = (session, name) => ({
  ...session,
  seenBy: [...new Set([...((session && session.seenBy) || []), name])].filter(Boolean),
})

export const scoreKey = (optId, critId) => `${optId}_${critId}`

// Has this person rated every option against every criterion?
export function hasFinished(matrix, session, name) {
  const v = session?.votes?.[name]
  if (!v) return false
  return (matrix.options || []).every(o =>
    (matrix.criteria || []).every(c => Number(v[scoreKey(o.id, c.id)]) > 0)
  )
}

export const finishedVoters = (matrix, session) =>
  (session?.participants || []).filter(n => hasFinished(matrix, session, n))

// Average every participant's rating per criterion, then add the criteria up.
// Someone who rated nothing simply doesn't count toward that average.
export function tally(matrix, session) {
  const votes = session?.votes || {}
  const voters = Object.keys(votes)
  const byOption = (matrix.options || []).map(opt => {
    const perCriterion = (matrix.criteria || []).map(c => {
      const key = scoreKey(opt.id, c.id)
      const vals = voters
        .map(v => Number(votes[v]?.[key]))
        .filter(n => Number.isFinite(n) && n > 0)
      return {
        id: c.id,
        name: c.name,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        count: vals.length,
      }
    })
    return {
      id: opt.id,
      name: opt.name,
      imageUrl: opt.imageUrl,
      perCriterion,
      total: perCriterion.reduce((s, c) => s + c.avg, 0),
    }
  })
  byOption.sort((a, b) => b.total - a.total)
  const top = byOption[0]
  const tied = top ? byOption.filter(o => Math.abs(o.total - top.total) < 1e-9) : []
  return {
    byOption,
    voters,
    winner: top && top.total > 0 && tied.length === 1 ? top : null,
    tied: tied.length > 1 ? tied : [],
  }
}
