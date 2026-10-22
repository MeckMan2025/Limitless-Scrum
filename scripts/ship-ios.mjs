import { spawnSync } from 'node:child_process'
import { rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs'

// Load .env so APPLE_ID and APPLE_APP_PASSWORD are available
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const APPLE_ID = process.env.APPLE_ID
const APPLE_APP_PASSWORD = process.env.APPLE_APP_PASSWORD
if (!APPLE_ID || !APPLE_APP_PASSWORD) {
  console.error('APPLE_ID and APPLE_APP_PASSWORD must be set in .env')
  process.exit(1)
}
const WORKSPACE_OR_PROJECT = 'ios/App/App.xcodeproj'
const SCHEME = 'App'
const ARCHIVE_PATH = 'ios/build/App.xcarchive'
const EXPORT_DIR = 'ios/build/export'
const EXPORT_OPTIONS = 'ios/ExportOptions.plist'

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`)
    process.exit(r.status ?? 1)
  }
}

// Clean previous build artifacts
if (existsSync('ios/build')) rmSync('ios/build', { recursive: true, force: true })
mkdirSync('ios/build', { recursive: true })

// 1. Bump build number
run('node', ['scripts/bump-ios-build.mjs'])

// 2. Build web + sync to iOS
run('npx', ['vite', 'build'])
run('npx', ['cap', 'sync', 'ios'])

// 3. Archive
run('xcodebuild', [
  '-project', WORKSPACE_OR_PROJECT,
  '-scheme', SCHEME,
  '-configuration', 'Release',
  '-destination', 'generic/platform=iOS',
  '-archivePath', ARCHIVE_PATH,
  'archive',
  'CODE_SIGN_STYLE=Automatic',
  '-allowProvisioningUpdates',
])

// 4. Export .ipa
run('xcodebuild', [
  '-exportArchive',
  '-archivePath', ARCHIVE_PATH,
  '-exportPath', EXPORT_DIR,
  '-exportOptionsPlist', EXPORT_OPTIONS,
  '-allowProvisioningUpdates',
])

// 5. Find ipa and upload
const ipaName = spawnSync('sh', ['-c', `ls ${EXPORT_DIR}/*.ipa | head -n1`], { encoding: 'utf8' }).stdout.trim()
if (!ipaName) {
  console.error('No .ipa file found in', EXPORT_DIR)
  process.exit(1)
}
console.log(`\nFound IPA: ${ipaName}`)

run('xcrun', [
  'altool',
  '--upload-app',
  '-f', ipaName,
  '-t', 'ios',
  '-u', APPLE_ID,
  '-p', APPLE_APP_PASSWORD,
])

console.log('\nUpload complete. Check App Store Connect → TestFlight → builds.')
console.log('Build will appear in 5-15 min after Apple processes it.')
