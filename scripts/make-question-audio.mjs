// Records every EN Helper question as a short audio clip, in the same voice
// as the opening prompt (Cloudflare Workers AI, Deepgram Aura 2, "thalia").
//
// The Helper reads each question out as it appears. A recorded clip plays on
// an iPhone even with the silent switch on and sounds like a person; the
// browser's own voice does neither. Clips are named by a hash of the
// question's wording, so changing a question in src/data/notebookSignals.js or
// notebookQuestions.js just means running this again; unchanged ones are kept.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run make:question-audio

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/helper/q')
const { allQuestionLabels } = await import(join(root, 'src/data/notebookQuestions.js'))

const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
if (!account || !token) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const manifest = {}
let made = 0

for (const label of allQuestionLabels()) {
  const name = createHash('sha1').update(label).digest('hex').slice(0, 12)
  manifest[label] = name
  const file = join(outDir, `${name}.mp3`)
  if (existsSync(file)) continue
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/deepgram/aura-2-en`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: label, speaker: 'thalia', encoding: 'mp3' }),
  })
  if (!res.ok) { console.error(`Failed (${res.status}): ${label}`); process.exit(1) }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  made++
}

// Clips for questions that no longer exist.
const keep = new Set(Object.values(manifest).map(n => `${n}.mp3`))
for (const f of readdirSync(outDir)) if (f.endsWith('.mp3') && !keep.has(f)) unlinkSync(join(outDir, f))

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`${Object.keys(manifest).length} questions, ${made} new clips.`)
