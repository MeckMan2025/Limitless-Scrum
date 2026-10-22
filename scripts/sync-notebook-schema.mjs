// Copies the notebook's fixed choices and signal questions into the
// notebook-voice edge function.
//
// The function runs on Supabase, not in the browser bundle, so it can't import
// src/data directly. It reads this JSON instead, and checks every answer the AI
// gives against it. Run after changing src/data/notebookSignals.js or
// src/data/notebookOptions.js, then redeploy notebook-voice:
//
//   npm run sync:notebook-schema
//
// With --check it only reports whether the copy is stale (the build runs this
// so a stale copy is noticed, but never fails the build over it).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'supabase/functions/notebook-voice/notebookSchema.json')

const { SIGNALS } = await import(join(root, 'src/data/notebookSignals.js'))
const { CATEGORIES, WHY_OPTIONS } = await import(join(root, 'src/data/notebookOptions.js'))

const schema = {
  categories: CATEGORIES.filter(c => c !== 'Custom'),
  whyOptions: WHY_OPTIONS,
  signals: SIGNALS.map(s => ({
    key: s.key,
    label: s.label,
    helper: s.helper,
    questions: s.questions.map(q => ({
      id: q.id,
      type: q.type,
      label: q.label,
      ...(q.options ? { options: q.options } : {}),
      // showIf is a function in the app. The AI only needs to know when the
      // question applies, so it gets the condition as written.
      ...(q.showIf ? { onlyWhen: q.showIf.toString() } : {}),
    })),
  })),
}

const text = JSON.stringify(schema, null, 2) + '\n'
const current = existsSync(out) ? readFileSync(out, 'utf8') : ''

if (process.argv.includes('--check')) {
  if (current !== text) {
    console.warn('\n⚠️  supabase/functions/notebook-voice/notebookSchema.json is out of date.')
    console.warn('   Run `npm run sync:notebook-schema`, then redeploy notebook-voice.\n')
  }
} else {
  writeFileSync(out, text)
  console.log(current === text ? 'notebookSchema.json already up to date.' : 'Wrote notebookSchema.json. Redeploy notebook-voice.')
}
