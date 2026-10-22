// The ranking point symbols, as the BIOBUZZ results screen draws them:
// one trophy square per point of a WIN (three) or TIE (one), a robot for
// the SWARM point, and a hive-shaped badge numbered 1 or 2 for the two
// POLLINATOR points. Drawn here so a scout can match the chip to the screen
// by shape without reading.

function Trophy({ lit = true, size = 18 }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm ${lit ? 'bg-blue-600 text-white' : 'bg-blue-900/30 text-white/70'}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.7} height={size * 0.7} fill="currentColor">
        <path d="M6 3h12v2h3v3a5 5 0 0 1-4.3 4.95A6 6 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1a6 6 0 0 1-3.7-3.95A5 5 0 0 1 3 8V5h3V3zm12 4v3.8A3 3 0 0 0 19 8V7h-1zM6 7H5v1a3 3 0 0 0 1 2.8V7z" />
      </svg>
    </span>
  )
}

function Hive({ n, size = 18 }) {
  // A pentagon standing on its base — the roofed shape on the screen.
  return (
    <span className="inline-flex items-center justify-center relative" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 3 L21 10 L19 21 L5 21 L3 10 Z" />
      </svg>
      <span className="absolute text-[9px] font-bold leading-none" style={{ top: size * 0.42 }}>{n}</span>
    </span>
  )
}

function Robot({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M11 2h2v3h3a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V2zm-3 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H8zm1 3h2v2H9v-2zm4 0h2v2h-2v-2zm-4 4h6v1.5H9V14zM2 10h2v5H2v-5zm18 0h2v5h-2v-5z" />
    </svg>
  )
}

export default function RpIcon({ option, size = 18 }) {
  switch (option) {
    case 'Win':  return <span className="inline-flex gap-0.5"><Trophy size={size} /><Trophy size={size} /><Trophy size={size} /></span>
    case 'Tie':  return <Trophy size={size} />
    case 'Swarm': return <Robot size={size} />
    case 'Pollinator 1': return <Hive n={1} size={size} />
    case 'Pollinator 2': return <Hive n={2} size={size} />
    default: return null
  }
}
