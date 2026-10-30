// The team's PostgreSQL database, on the robotics server.
//
// The app was written against Supabase, with forty-odd tables. Here every one
// of them lives in a single table, `rows`: one line per row, the row itself as
// JSON. That is exactly how the browser database (src/lib/localDb.js) kept them,
// so the app's queries behave the same against either, and a column the app
// starts writing tomorrow needs no migration.
//
// Accounts are real tables of their own: auth_users, auth_refresh_tokens.
// Uploaded files are on disk (storage.js); storage_objects remembers their type.
//
// Connection settings come from the environment the release provides:
// PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.

import pg from 'pg'
import { randomBytes } from 'node:crypto'

// Everything of the app's is in its own schema, `scrum`, so it can share the
// team's database with anything else the team runs (the team website, today).
export const SCHEMA = 'scrum'
export const pool = new pg.Pool({ max: 10, options: `-c search_path=${SCHEMA}` })

// Versioned migrations: each runs once, in order, and is recorded.
const MIGRATIONS = [
  `create table rows (
     tbl  text  not null,
     id   text  not null,
     data jsonb not null,
     primary key (tbl, id)
   )`,
  `create table auth_users (
     id              text primary key,
     email           text not null unique,
     password_hash   text not null,
     created_at      timestamptz not null default now(),
     updated_at      timestamptz not null default now(),
     last_sign_in_at timestamptz
   )`,
  `create table auth_refresh_tokens (
     token_hash text primary key,
     user_id    text not null references auth_users(id) on delete cascade,
     created_at timestamptz not null default now(),
     revoked_at timestamptz
   )`,
  `create index auth_refresh_tokens_user on auth_refresh_tokens (user_id)`,
  `create table storage_objects (
     bucket       text not null,
     path         text not null,
     content_type text not null,
     size         bigint not null,
     created_at   timestamptz not null default now(),
     primary key (bucket, path)
   )`,
  `create table server_meta (key text primary key, value text not null)`,
]

export async function migrate() {
  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock(7300001)')
    await client.query(`create schema if not exists ${SCHEMA}`)
    await client.query('create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())')
    const { rows } = await client.query('select coalesce(max(version), 0) as v from schema_migrations')
    for (let v = Number(rows[0].v) + 1; v <= MIGRATIONS.length; v++) {
      await client.query('begin')
      try {
        await client.query(MIGRATIONS[v - 1])
        await client.query('insert into schema_migrations (version) values ($1)', [v])
        await client.query('commit')
      } catch (e) {
        await client.query('rollback')
        throw e
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(7300001)').catch(() => {})
    client.release()
  }
}

// The key that signs sign-in tokens. Made once and kept in the database, so it
// survives a release and is backed up with everything else, and nobody has to
// put a secret on the server by hand. JWT_SECRET in the environment wins if set.
let secretCache = null
export async function jwtSecret() {
  if (secretCache) return secretCache
  if (process.env.JWT_SECRET) return (secretCache = process.env.JWT_SECRET)
  await pool.query(
    `insert into server_meta (key, value) values ('jwt_secret', $1) on conflict (key) do nothing`,
    [randomBytes(48).toString('base64url')],
  )
  const { rows } = await pool.query(`select value from server_meta where key = 'jwt_secret'`)
  return (secretCache = rows[0].value)
}

// ---- the app's tables --------------------------------------------------------

export const validTable = (name) => /^[a-z_][a-z0-9_]{0,62}$/.test(name)

// Every row of one table, narrowed by the filters PostgreSQL can apply exactly
// the way restQuery.js would: col=eq.<text>. Everything else (and these again)
// is applied by restQuery.js afterwards, so this only ever saves work.
export async function readTable(db, tbl, params) {
  const where = ['tbl = $1']
  const args = [tbl]
  if (params) {
    for (const [col, v] of params.entries()) {
      if (!/^[a-z_][a-z0-9_]*$/.test(col) || !v.startsWith('eq.')) continue
      const raw = v.slice(3)
      // Numbers, booleans and null compare loosely in restQuery; leave those to it.
      if (raw === '' || raw === 'null' || raw === 'true' || raw === 'false' || /^-?\d/.test(raw)) continue
      args.push(col, raw)
      where.push(`data->>$${args.length - 1} = $${args.length}`)
    }
  }
  const { rows } = await db.query(`select data from rows where ${where.join(' and ')}`, args)
  return rows.map((r) => r.data)
}

// Writes to one table happen one at a time, so an upsert's "is it there?" and
// its write cannot interleave with another's.
export async function lockTable(db, tbl) {
  await db.query('select pg_advisory_xact_lock(hashtext($1))', [`rows:${tbl}`])
}

export async function putRow(db, tbl, row) {
  await db.query(
    `insert into rows (tbl, id, data) values ($1, $2, $3)
     on conflict (tbl, id) do update set data = excluded.data`,
    [tbl, String(row.id), row],
  )
}

export async function deleteRow(db, tbl, id) {
  await db.query('delete from rows where tbl = $1 and id = $2', [tbl, String(id)])
}

// Run fn inside a transaction; returns what fn returns.
export async function transaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
