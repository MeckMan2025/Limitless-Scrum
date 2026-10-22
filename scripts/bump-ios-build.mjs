import { readFileSync, writeFileSync } from 'node:fs'

const pbxproj = 'ios/App/App.xcodeproj/project.pbxproj'
const text = readFileSync(pbxproj, 'utf8')

const matches = [...text.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)]
if (matches.length === 0) {
  console.error('No CURRENT_PROJECT_VERSION lines found.')
  process.exit(1)
}

const current = Math.max(...matches.map((m) => parseInt(m[1], 10)))
const next = current + 1

const updated = text.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`)
writeFileSync(pbxproj, updated)

console.log(`iOS build number: ${current} -> ${next}`)
