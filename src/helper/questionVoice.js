// Reading the questions out loud.
//
// Every question is a recorded clip (public/helper/q/, made by
// scripts/make-question-audio.mjs) in the same voice as the opening prompt.
// One <audio> element plays all of them: an iPhone only lets a page start
// sound from a tap, but once an element has played from a tap, the page can
// play it again later by itself. unlock() is that first play, called from the
// tap that starts the questions.

const MUTE_KEY = 'en-helper-read-aloud'

let player = null
let manifest = null
let manifestLoading = null

const audio = () => {
  if (!player) player = new Audio()
  return player
}

function loadManifest() {
  if (manifest) return Promise.resolve(manifest)
  if (!manifestLoading) {
    manifestLoading = fetch('/helper/q/manifest.json')
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then(m => { manifest = m; return m })
  }
  return manifestLoading
}

export function readAloudOn() {
  try { return localStorage.getItem(MUTE_KEY) !== 'off' } catch { return true }
}

export function setReadAloud(on) {
  try { localStorage.setItem(MUTE_KEY, on ? 'on' : 'off') } catch { /* this visit only */ }
  if (!on) stopVoice()
}

// Call from a tap. Plays nothing audible; it only earns the right to play.
export function unlockVoice() {
  loadManifest()
  const a = audio()
  a.muted = true
  a.play().then(() => { a.pause(); a.muted = false }).catch(() => { a.muted = false })
}

export function stopVoice() {
  try { player?.pause() } catch { /* nothing playing */ }
  try { window.speechSynthesis?.cancel() } catch { /* no voice */ }
}

// Read one question. Uses its clip when there is one, and the browser's own
// voice for anything without (a question added since the clips were made).
export async function speakQuestion(label, { force = false } = {}) {
  if (!force && !readAloudOn()) return
  stopVoice()
  const m = await loadManifest()
  const name = m[label]
  if (name) {
    const a = audio()
    a.src = `/helper/q/${name}.mp3`
    try { await a.play(); return } catch { /* fall through to the browser's voice */ }
  }
  try {
    const u = new SpeechSynthesisUtterance(label)
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch { /* no voice on this device */ }
}
