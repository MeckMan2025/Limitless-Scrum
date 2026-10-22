// Recording a voice entry, and turning it into a file Whisper can always read.
//
// Phones record in different formats (an iPhone gives audio/mp4, Chrome gives
// audio/webm), and not every one is guaranteed to decode on the server. So the
// clip is converted here to the plainest audio there is: 16 kHz mono WAV, the
// rate Whisper listens at anyway. A minute is about 2 MB.

export const MAX_SECONDS = 180

export function canRecord() {
  return typeof window !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window.MediaRecorder !== 'undefined'
}

// The first format on the list this browser can record in.
function pickMimeType() {
  const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  return options.find(t => window.MediaRecorder.isTypeSupported?.(t)) || ''
}

// Starts recording straight away. Rejects if the microphone is refused.
// Returns { stop(): Promise<Blob>, cancel() }.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
  // A chunk every second, so a recording cut short still has everything up
  // to that point.
  recorder.start(1000)

  const release = () => stream.getTracks().forEach(t => t.stop())

  return {
    stop: () => new Promise((resolve) => {
      recorder.onstop = () => {
        release()
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/mp4' }))
      }
      recorder.stop()
    }),
    cancel: () => {
      recorder.onstop = release
      try { recorder.stop() } catch { release() }
    },
  }
}

// Recorded clip -> 16 kHz mono WAV. Resolves null if this browser can't
// decode its own recording, in which case the original is uploaded instead.
export async function toWav(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const data = await blob.arrayBuffer()
    // The callback form, because older Safari never returned a promise here.
    const decoded = await new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))
    ctx.close?.()

    const rate = 16000
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
    const offline = new Offline(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), rate)
  } catch (err) {
    console.warn('[EN Helper] WAV conversion failed, uploading the original:', err)
    return null
  }
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)) }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)       // fmt chunk size
  view.setUint16(20, 1, true)        // PCM
  view.setUint16(22, 1, true)        // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // bytes per second
  view.setUint16(32, 2, true)        // bytes per sample
  view.setUint16(34, 16, true)       // bits per sample
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
