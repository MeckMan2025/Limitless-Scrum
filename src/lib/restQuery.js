// The PostgREST query language, as much of it as the app uses: filters,
// or=(...), order, and select's column list. Pure functions over plain rows,
// shared by the browser database (localDb.js) and the team server
// (server/rest.js), so the two answer every query the same way.

// ---- filters ---------------------------------------------------------------
export function parseValue(v) {
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}
export function looseEq(a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  return String(a) === String(b)
}
function likeToRegex(pattern, flags) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${esc}$`, flags)
}
function test(row, col, op, raw) {
  const val = row[col]
  switch (op) {
    case 'eq': return looseEq(val, parseValue(raw))
    case 'neq': return !looseEq(val, parseValue(raw))
    case 'gt': return val != null && val > raw
    case 'gte': return val != null && val >= raw
    case 'lt': return val != null && val < raw
    case 'lte': return val != null && val <= raw
    case 'like': return typeof val === 'string' && likeToRegex(raw, '').test(val)
    case 'ilike': return typeof val === 'string' && likeToRegex(raw, 'i').test(val)
    case 'is': return raw === 'null' ? val == null : raw === 'true' ? val === true : raw === 'false' ? val === false : looseEq(val, raw)
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((s) => parseValue(s.trim().replace(/^"|"$/g, '')))
      return list.some((x) => looseEq(val, x))
    }
    case 'cs': { // contains, for arrays: cs.{a,b}
      const list = raw.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
      return Array.isArray(val) && list.every((x) => val.some((v) => looseEq(v, x)))
    }
    case 'ov': { // overlaps
      const list = raw.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
      return Array.isArray(val) && list.some((x) => val.some((v) => looseEq(v, x)))
    }
    case 'not': { // not.op.value
      const i = raw.indexOf('.')
      return !test(row, col, raw.slice(0, i), raw.slice(i + 1))
    }
    default: return true
  }
}
// or=(a.eq.1,b.is.null) — one level, enough for the app.
function testOr(row, expr) {
  const inner = expr.replace(/^\(|\)$/g, '')
  const parts = inner.match(/[^,(]+(\([^)]*\))?/g) || []
  return parts.some((p) => {
    const [col, op, ...rest] = p.trim().split('.')
    return test(row, col, op, rest.join('.'))
  })
}
export const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

export function filterRows(rows, params) {
  return rows.filter((row) => {
    for (const [k, v] of params.entries()) {
      if (RESERVED.has(k)) continue
      if (k === 'or') { if (!testOr(row, v)) return false; continue }
      if (k === 'and') continue
      const i = v.indexOf('.')
      if (i < 0) continue
      const op = v.slice(0, i), raw = v.slice(i + 1)
      if (!test(row, k, op, raw)) return false
    }
    return true
  })
}
export function orderRows(rows, order) {
  if (!order) return rows
  const keys = order.split(',').map((o) => {
    const [col, ...mods] = o.split('.')
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') }
  })
  return [...rows].sort((a, b) => {
    for (const { col, desc, nullsFirst } of keys) {
      const x = a[col], y = b[col]
      if (x == null && y == null) continue
      if (x == null) return nullsFirst ? -1 : 1
      if (y == null) return nullsFirst ? 1 : -1
      if (x < y) return desc ? 1 : -1
      if (x > y) return desc ? -1 : 1
    }
    return 0
  })
}
// select=a,b,other(c) → keep the plain columns; embedded resources come back
// as empty arrays so callers that map over them don't throw.
export function project(row, select) {
  if (!select || select.trim() === '*') return row
  const out = {}
  const cols = select.match(/[^,(]+(\([^)]*\))?/g) || []
  let star = false
  for (const c of cols) {
    const s = c.trim()
    if (s === '*') { star = true; continue }
    const m = /^([\w]+)(?::([\w]+))?(\(|$)/.exec(s)
    if (!m) continue
    const [, name, alias, embed] = m
    if (embed === '(') out[alias || name] = []
    else out[alias || name] = row[name]
  }
  return star ? { ...row, ...out } : out
}
