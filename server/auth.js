// Accounts: the part of Supabase Auth (GoTrue) the app uses, at /auth/v1.
//
// supabase-js signs in, signs up, refreshes and changes passwords through
// these addresses and keeps the session it gets back in localStorage, exactly
// as it did against Supabase. A session is a short-lived access token (a JWT
// signed with HS256, one hour) and a refresh token that is swapped for a new
// pair each time it is used.
//
// Nobody signs up without an invitation: the address must be on the
// approved_emails list (User Management), the same rule the app has always had.
// No mail leaves the robotics server, so a forgotten password is reset by a
// lead in User Management, who hands over a temporary one.

import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { pool, jwtSecret, readTable } from './db.js'

const scryptAsync = promisify(scrypt)
const ACCESS_SECONDS = 3600

// ---- passwords ----------------------------------------------------------------

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scryptAsync(String(password), salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scryptAsync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 })
  return timingSafeEqual(key, expected)
}

export const MIN_PASSWORD = 6

// ---- tokens -------------------------------------------------------------------

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

async function signJwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64(payload)
  const sig = createHmac('sha256', await jwtSecret()).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

// The signed-in person a bearer token stands for, or null.
export async function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const sig = createHmac('sha256', await jwtSecret()).update(`${parts[0]}.${parts[1]}`).digest()
  const given = Buffer.from(parts[2], 'base64url')
  if (given.length !== sig.length || !timingSafeEqual(given, sig)) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (!claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null
    return claims
  } catch {
    return null
  }
}

export async function callerFrom(req) {
  const h = req.headers.authorization || ''
  return verifyJwt(h.startsWith('Bearer ') ? h.slice(7) : '')
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

// The user object supabase-js expects.
function publicUser(u) {
  const at = (d) => (d ? new Date(d).toISOString() : null)
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: at(u.created_at),
    confirmed_at: at(u.created_at),
    phone: '',
    last_sign_in_at: at(u.last_sign_in_at),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: at(u.created_at),
    updated_at: at(u.updated_at),
    is_anonymous: false,
  }
}

async function newSession(user) {
  const now = Math.floor(Date.now() / 1000)
  const access = await signJwt({
    sub: user.id, email: user.email, aud: 'authenticated', role: 'authenticated',
    iat: now, exp: now + ACCESS_SECONDS,
  })
  const refresh = randomBytes(32).toString('base64url')
  await pool.query('insert into auth_refresh_tokens (token_hash, user_id) values ($1, $2)', [sha256(refresh), user.id])
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: ACCESS_SECONDS,
    expires_at: now + ACCESS_SECONDS,
    refresh_token: refresh,
    user: publicUser(user),
  }
}

// ---- who is invited ------------------------------------------------------------

// The roles a lead pre-assigned to an invited address ('member' when none),
// or null when the address was never invited. Same answer as the
// check_approved_email function the app calls before signing up.
export async function approvedRole(email) {
  const addr = String(email || '').trim().toLowerCase()
  if (!addr) return null
  const rows = await readTable(pool, 'approved_emails')
  const row = rows.find((r) => String(r.email || '').trim().toLowerCase() === addr)
  if (!row) return null
  return row.role ? String(row.role) : 'member'
}

// ---- wrong passwords ------------------------------------------------------------

// Ten wrong passwords for one address in fifteen minutes closes it for the rest
// of that window. In memory: a restart forgets, which errs towards letting in.
const failures = new Map()
const WINDOW_MS = 15 * 60 * 1000
function lockedOut(email) {
  const f = failures.get(email)
  if (!f || Date.now() - f.first > WINDOW_MS) { failures.delete(email); return false }
  return f.count >= 10
}
function noteFailure(email) {
  const f = failures.get(email)
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(email, { first: Date.now(), count: 1 })
  else f.count++
}

// ---- the endpoints ----------------------------------------------------------------

const authError = (status, code, msg) => ({ status, body: { code: status, error_code: code, msg } })

export async function createUser(email, password) {
  const id = randomUUID()
  const { rows } = await pool.query(
    'insert into auth_users (id, email, password_hash) values ($1, $2, $3) returning *',
    [id, email, await hashPassword(password)],
  )
  return rows[0]
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query('select * from auth_users where email = $1', [String(email || '').trim().toLowerCase()])
  return rows[0] || null
}

export async function findUserById(id) {
  const { rows } = await pool.query('select * from auth_users where id = $1', [id])
  return rows[0] || null
}

// path is what follows /auth/v1. Returns { status, body }.
export async function handleAuth(method, path, query, body, req) {
  if (method === 'GET' && path === '/settings') {
    return { status: 200, body: { external: { email: true }, disable_signup: false, mailer_autoconfirm: true } }
  }

  if (method === 'POST' && path === '/token') {
    const grant = query.get('grant_type')
    if (grant === 'password') {
      const email = String(body?.email || '').trim().toLowerCase()
      if (lockedOut(email)) return authError(429, 'over_request_rate_limit', 'Too many wrong passwords. Try again in 15 minutes.')
      const user = await findUserByEmail(email)
      if (!user || !(await checkPassword(body?.password, user.password_hash))) {
        noteFailure(email)
        return authError(400, 'invalid_credentials', 'Invalid login credentials')
      }
      failures.delete(email)
      const { rows } = await pool.query('update auth_users set last_sign_in_at = now() where id = $1 returning *', [user.id])
      return { status: 200, body: await newSession(rows[0]) }
    }
    if (grant === 'refresh_token') {
      const token = String(body?.refresh_token || '')
      // Swapped for a new pair on use. Both supabase-js and the app's own
      // keeper (src/lib/restHeaders.js) refresh, and two tabs can too, so a
      // token used again within ten seconds still works, as with Supabase;
      // after that it is spent.
      const { rows } = await pool.query(
        `update auth_refresh_tokens set revoked_at = coalesce(revoked_at, now())
         where token_hash = $1 and created_at > now() - interval '60 days'
           and (revoked_at is null or revoked_at > now() - interval '10 seconds')
         returning user_id`,
        [sha256(token)],
      )
      const user = rows[0] && await findUserById(rows[0].user_id)
      if (!user) return authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
      return { status: 200, body: await newSession(user) }
    }
    return authError(400, 'unsupported_grant_type', 'Unsupported grant type')
  }

  if (method === 'POST' && path === '/signup') {
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    if (!email || !email.includes('@')) return authError(400, 'validation_failed', 'Enter an email address')
    if (password.length < MIN_PASSWORD) return authError(422, 'weak_password', `Password should be at least ${MIN_PASSWORD} characters.`)
    if ((await approvedRole(email)) == null) {
      return authError(403, 'signup_disabled', 'That email has not been approved yet. Ask a lead to add it in User Management.')
    }
    if (await findUserByEmail(email)) return authError(422, 'user_already_exists', 'User already registered')
    const user = await createUser(email, password)
    await pool.query('update auth_users set last_sign_in_at = now() where id = $1', [user.id])
    return { status: 200, body: await newSession(user) }
  }

  if (method === 'POST' && path === '/recover') {
    return authError(400, 'email_provider_disabled',
      'Password reset emails are not available. Ask a lead to reset your password in User Management.')
  }

  // Everything below needs the signed-in person.
  const claims = await callerFrom(req)
  if (!claims) return authError(401, 'no_authorization', 'This endpoint requires a valid Bearer token')
  const me = await findUserById(claims.sub)
  if (!me) return authError(401, 'user_not_found', 'User from sub claim in JWT does not exist')

  if (method === 'GET' && path === '/user') return { status: 200, body: publicUser(me) }

  if (method === 'PUT' && path === '/user') {
    if (body?.password != null) {
      if (String(body.password).length < MIN_PASSWORD) return authError(422, 'weak_password', `Password should be at least ${MIN_PASSWORD} characters.`)
      await pool.query('update auth_users set password_hash = $2, updated_at = now() where id = $1', [me.id, await hashPassword(body.password)])
    }
    if (body?.email != null && String(body.email).trim().toLowerCase() !== me.email) {
      return authError(400, 'email_change_disabled', 'Ask a lead to change your login email in User Management.')
    }
    return { status: 200, body: publicUser(await findUserById(me.id)) }
  }

  if (method === 'POST' && path === '/logout') {
    // scope=local signs out this device only; the default signs out everywhere.
    if (query.get('scope') !== 'local' && query.get('scope') !== 'others') {
      await pool.query('update auth_refresh_tokens set revoked_at = now() - interval \'1 minute\' where user_id = $1', [me.id])
    }
    return { status: 204 }
  }

  return authError(404, 'not_found', 'Not found')
}
