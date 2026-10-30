// Account chores from the robotics server's shell, for when nobody can do them
// in the app: the very first account, and getting a lead back in.
//
//   node server/cli.js approve <email> [roles]   invite an address (roles comma-separated,
//                                                e.g. "Co-Founder"); they then sign up in the app
//   node server/cli.js reset <email>             a temporary password, printed once, that must
//                                                be changed at the next sign-in
//   node server/cli.js list                      accounts and invitations
//
// On the robotics server, inside the running container:
//   sudo robotics-team docker 9082 exec live-web-1 node server/cli.js approve someone@example.org Co-Founder

import { randomBytes, randomUUID } from 'node:crypto'
import { pool, migrate, readTable, lockTable, putRow, transaction } from './db.js'
import { findUserByEmail, hashPassword } from './auth.js'

const [cmd, emailArg, roles] = process.argv.slice(2)
const email = String(emailArg || '').trim().toLowerCase()

async function main() {
  await migrate()
  if (cmd === 'approve' && email.includes('@')) {
    await transaction(async (db) => {
      await lockTable(db, 'approved_emails')
      const existing = (await readTable(db, 'approved_emails')).find((r) => String(r.email).toLowerCase() === email)
      const row = { ...(existing || { id: randomUUID(), created_at: new Date().toISOString() }), email, role: roles || existing?.role || 'member' }
      await putRow(db, 'approved_emails', row)
    })
    console.log(`${email} is invited${roles ? ` as ${roles}` : ''}. They can now sign up in the app with that address.`)
    console.log('(Open browsers see this after a reload.)')
    return
  }
  if (cmd === 'reset' && email.includes('@')) {
    const user = await findUserByEmail(email)
    if (!user) { console.error(`No account for ${email}.`); process.exitCode = 1; return }
    const temp = randomBytes(9).toString('base64url')
    await pool.query('update auth_users set password_hash = $2, updated_at = now() where id = $1', [user.id, await hashPassword(temp)])
    await pool.query('update auth_refresh_tokens set revoked_at = now() - interval \'1 minute\' where user_id = $1', [user.id])
    await transaction(async (db) => {
      await lockTable(db, 'profiles')
      const p = (await readTable(db, 'profiles')).find((r) => String(r.id) === user.id)
      if (p) await putRow(db, 'profiles', { ...p, must_change_password: true })
    })
    console.log(`Temporary password for ${email} (shown once): ${temp}`)
    return
  }
  if (cmd === 'list') {
    const { rows } = await pool.query('select email, created_at, last_sign_in_at from auth_users order by email')
    console.log('Accounts:')
    for (const u of rows) console.log(`  ${u.email}  created ${u.created_at.toISOString().slice(0, 10)}  last sign-in ${u.last_sign_in_at?.toISOString().slice(0, 10) || 'never'}`)
    console.log('Invited:')
    for (const a of await readTable(pool, 'approved_emails')) console.log(`  ${a.email}  ${a.role || 'member'}`)
    return
  }
  console.log('Usage: node server/cli.js approve <email> [roles] | reset <email> | list')
  process.exitCode = 1
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => pool.end())
