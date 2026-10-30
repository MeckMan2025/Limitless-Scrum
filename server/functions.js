// What were Supabase Edge Functions, at /functions/v1/<name>.
//
// The account tools User Management calls (admin-create-user,
// admin-reset-password, admin-delete-user) are here in full, with the same
// rules as supabase/functions/_shared/adminAuth.ts: who may use them, and on
// whose accounts. The rest (push notifications, scheduled reminders, the
// notebook voice helper) belong to features that are switched off by default
// and need outside services; they answer without doing anything.

import { pool, readTable, lockTable, putRow, deleteRow, transaction } from './db.js'
import { createUser, findUserByEmail, findUserById, hashPassword, MIN_PASSWORD } from './auth.js'
import { publish } from './realtime.js'
import { HOME_TEAM_NUMBER } from '../src/data/team.js'

// Must match ACCOUNT_ADMIN_TAGS in src/hooks/usePermissions.js.
const ADMIN_TAGS = [
  'Co-Founder', 'Mentor', 'Coach', 'Team Lead', 'Project Manager', 'Business Lead', 'Technical Lead',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead',
]
const SENIOR_TAGS = ['Co-Founder', 'Mentor', 'Coach']

// NULL, '' and our own number all mean the home team.
const teamKey = (t) => {
  const s = String(t ?? '').trim()
  return s === '' || s === HOME_TEAM_NUMBER ? null : s
}

const isTeamLogin = (tags, email) => tags.includes('Team') || /^team\d+@teams\.radical$/i.test(email || '')

async function profileOf(id) {
  const rows = await readTable(pool, 'profiles', new URLSearchParams({ id: `eq.${id}` }))
  return rows.find((r) => String(r.id) === String(id)) || null
}

// null: not allowed to use the account tools at all.
async function authorizeAdmin(caller) {
  const profile = await profileOf(caller.sub)
  const tags = profile?.function_tags || []
  const onHome = !!profile && teamKey(profile.team_number) === null && !isTeamLogin(tags, caller.email)
  const legacyLead = profile?.role === 'lead'
  const isLead = onHome && (legacyLead || tags.some((t) => ADMIN_TAGS.includes(t)))
  const isSenior = onHome && (legacyLead || tags.some((t) => SENIOR_TAGS.includes(t)))
  if (isLead) return { id: caller.sub, isLead, isSenior, team: null }

  const controlled = (await readTable(pool, 'team_accounts')).filter((r) => String(r.user_id) === String(caller.sub))
  const team = controlled[0]?.full_access ? teamKey(controlled[0].team_number) : null
  if (team) return { id: caller.sub, isLead: false, isSenior: false, team }
  return null
}

// Why this caller may not act on this account, or null if they may.
async function refuseTarget(who, userId, verb) {
  const target = await profileOf(userId)
  if (who.team) {
    if (!target || teamKey(target.team_number) !== who.team) return `You can only ${verb} your own team's members`
    return null
  }
  if (who.isSenior) return null
  const tags = target?.function_tags || []
  const controls = (await readTable(pool, 'team_accounts')).some((r) => String(r.user_id) === String(userId))
  const isProtected = target?.role === 'lead' || tags.includes('Team') || tags.some((t) => ADMIN_TAGS.includes(t)) || controls
  return isProtected ? `Only a mentor, coach or co-founder can ${verb} a lead's or a team's account` : null
}

// Write one profile row and tell everyone listening.
async function saveProfile(row, old) {
  await transaction(async (db) => {
    await lockTable(db, 'profiles')
    await putRow(db, 'profiles', row)
  })
  publish([{ table: 'profiles', type: old ? 'UPDATE' : 'INSERT', record: row, old_record: old || undefined }])
}

const fail = (status, error) => ({ status, body: { error } })

async function adminCreateUser(who, body) {
  const { email, password, displayName, role } = body || {}
  if (!email || !password || !displayName) return fail(400, 'email, password, and displayName are required')
  if (String(password).length < MIN_PASSWORD) return fail(400, `Password must be at least ${MIN_PASSWORD} characters`)
  const addr = String(email).toLowerCase().trim()
  if (await findUserByEmail(addr)) return fail(400, 'A user with this email address has already been registered')
  const user = await createUser(addr, password)
  await saveProfile({
    id: user.id,
    display_name: String(displayName).trim(),
    // 'lead' makes a full lead, so only a senior lead may hand it out.
    role: role === 'lead' && !who.isSenior ? 'member' : (role || 'member'),
    authority_tier: role === 'guest' ? 'guest' : 'teammate',
    function_tags: role === 'guest' ? ['Guest'] : [],
    must_change_password: true,
    created_at: new Date().toISOString(),
    ...(who.team ? { team_number: who.team } : {}),
  })
  return { status: 200, body: { success: true, userId: user.id, displayName: String(displayName).trim() } }
}

async function adminResetPassword(who, body) {
  const { userId, newPassword, newEmail } = body || {}
  if (!userId || (!newPassword && !newEmail)) return fail(400, 'userId and one of newPassword or newEmail are required')
  const refusal = await refuseTarget(who, userId, 'reset passwords for')
  if (refusal) return fail(403, refusal)
  if (who.team && newEmail) return fail(403, 'Only leads can change a login email')
  if (newPassword && String(newPassword).length < MIN_PASSWORD) return fail(400, `Password must be at least ${MIN_PASSWORD} characters`)
  const user = await findUserById(userId)
  if (!user) return fail(400, 'User not found')
  if (newEmail) {
    const addr = String(newEmail).trim().toLowerCase()
    const other = await findUserByEmail(addr)
    if (other && other.id !== userId) return fail(400, 'A user with this email address has already been registered')
    await pool.query('update auth_users set email = $2, updated_at = now() where id = $1', [userId, addr])
  }
  if (newPassword) {
    await pool.query('update auth_users set password_hash = $2, updated_at = now() where id = $1', [userId, await hashPassword(newPassword)])
    // The old password's sessions end with it.
    await pool.query('update auth_refresh_tokens set revoked_at = now() - interval \'1 minute\' where user_id = $1', [userId])
  }
  const old = await profileOf(userId)
  if (old) await saveProfile({ ...old, must_change_password: !!newPassword, updated_at: new Date().toISOString() }, old)
  return { status: 200, body: { success: true } }
}

async function adminDeleteUser(who, caller, body) {
  const { userId } = body || {}
  if (!userId) return fail(400, 'userId is required')
  if (userId === caller.sub) return fail(400, 'You cannot delete your own account')
  const refusal = await refuseTarget(who, userId, 'delete')
  if (refusal) return fail(403, refusal)
  const user = await findUserById(userId)
  await pool.query('delete from auth_users where id = $1', [userId])
  const old = await profileOf(userId)
  if (old) {
    await transaction(async (db) => { await lockTable(db, 'profiles'); await deleteRow(db, 'profiles', userId) })
    publish([{ table: 'profiles', type: 'DELETE', old_record: old }])
  }
  return { status: 200, body: { success: true, email: user?.email ?? null } }
}

// name is what follows /functions/v1/. claims: the signed-in person, or null.
export async function handleFunction(method, name, body, claims) {
  if (method !== 'POST') return fail(405, 'Method not allowed')
  if (!claims) return fail(401, 'Missing authorization')

  if (name === 'admin-create-user' || name === 'admin-reset-password' || name === 'admin-delete-user') {
    const who = await authorizeAdmin(claims)
    if (!who) {
      const what = { 'admin-create-user': 'create accounts', 'admin-reset-password': 'reset passwords', 'admin-delete-user': 'delete accounts' }[name]
      return fail(403, `Only leads can ${what}`)
    }
    if (name === 'admin-create-user') return adminCreateUser(who, body)
    if (name === 'admin-reset-password') return adminResetPassword(who, body)
    return adminDeleteUser(who, claims, body)
  }

  if (name === 'send-push' || name === 'process-scheduled') return { status: 200, body: { ok: true, sent: 0 } }
  if (name === 'notebook-voice') return fail(501, 'The notebook voice helper is not set up on this server')
  return fail(404, `No function named ${name}`)
}
