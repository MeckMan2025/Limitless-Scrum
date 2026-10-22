import { useState } from 'react'
import {
  ALLIANCE_ZONES, BARS, FIELD, FIELD_IMAGE, POSTS, STRUCTURES,
  pointOf, spotsFor, startLabel, zonesFor,
} from '../data/fieldMap'

// Tap the field to say where something was.
//
// Two questions use it. Where a robot started is a dot put down anywhere on
// the field, because a robot lines up where it lines up and three areas made
// anything near a boundary a coin toss between two words. Which flowers a
// team finished owning is several answers out of four fixed places, so those
// are drawn as marks standing where the flowers stand, and tapping one
// toggles it.
//
// The geometry lives in data/fieldMap.js — this only draws it. If the official
// overhead picture of the field is sitting at FIELD_IMAGE it goes underneath
// the zones; if it isn't there, or a phone can't load it, the field is drawn
// instead and the input works exactly the same. A scout at a competition with
// no signal must never be left with a broken picture and no way to answer.
//
// The value saved is the zone's own option string, unchanged from when this
// was three buttons, so everything already recorded still reads the same.

export default function FieldMap({ value, onChange, options = [], multi = false }) {
  const [hasImage, setHasImage] = useState(true)
  // No options and one answer means put the dot where you like.
  const free = !multi && options.length === 0
  const zones = multi || free ? [] : zonesFor(options)
  const spots = multi ? spotsFor(options) : []
  const point = free ? pointOf(value) : null
  const pct = (n) => `${n * 100}%`

  // Where the tap landed, as a percentage of the field each way. Rounded to
  // a tenth: finer than anyone can tap, and it keeps the stored value short.
  const place = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    const at = (v, size) => Math.round(Math.max(0, Math.min(1, v / size)) * 1000) / 10
    onChange(`${at(e.clientX - r.left, r.width)},${at(e.clientY - r.top, r.height)}`)
  }

  // Several answers are stored exactly as the tick-all inputs store them — a
  // comma-joined list — so nothing downstream can tell the difference between
  // a flower ticked off a list and the same flower tapped on the map.
  const picked = multi ? String(value || '').split(',').filter(Boolean) : []
  // Blank means they owned none; there is nothing to press for that.
  const toggle = (opt) => {
    const without = picked.filter(x => x !== opt && x !== 'None')
    onChange((picked.includes(opt) ? without : [...without, opt]).join(','))
  }

  return (
    <div>
      <div
        onClick={free ? place : undefined}
        role={free ? 'button' : undefined}
        tabIndex={free ? 0 : undefined}
        aria-label={free ? 'Tap the field where the robot starts' : undefined}
        className={`relative w-full rounded-xl overflow-hidden border-2 border-brand-gold-dark/30 bg-gray-100 select-none ${
          free ? 'cursor-crosshair' : ''
        }`}
        style={{ aspectRatio: String(FIELD.aspect) }}
      >
        {hasImage && (
          <img
            src={FIELD_IMAGE}
            alt=""
            onError={() => setHasImage(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* The field as drawn, traced off the field drawing: tiles, the four
            middle structures with their bars, the gold posts and the alliance
            zones against the walls. Enough to recognise and point at, which
            is all this has to be. Coordinates in data/fieldMap.js. */}
        {!hasImage && (
          <>
            <div
              className="absolute inset-0 bg-gray-200"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(0,0,0,.07) 1px, transparent 1px),' +
                  'linear-gradient(to bottom, rgba(0,0,0,.07) 1px, transparent 1px)',
                backgroundSize: `${100 / FIELD.tiles}% ${100 / FIELD.tiles}%`,
              }}
            />

            {ALLIANCE_ZONES.map((z, i) => (
              <div
                key={`az${i}`}
                className={`absolute rounded-sm ${z.alliance === 'red' ? 'bg-red-400/70' : 'bg-blue-400/70'}`}
                style={{ left: pct(z.x), top: pct(z.y), width: pct(z.w), height: pct(z.h) }}
              />
            ))}

            {STRUCTURES.map(st => (
              <div
                key={st.key}
                className={`absolute rounded-md border-2 ${
                  st.alliance === 'red'
                    ? 'border-red-700/70 bg-red-200/40'
                    : 'border-blue-700/70 bg-blue-200/40'
                }`}
                style={{ left: pct(st.x), top: pct(st.y), width: pct(st.w), height: pct(st.h) }}
              />
            ))}

            {BARS.map((b, i) => (
              <div
                key={`bar${i}`}
                className="absolute rounded-sm bg-yellow-200/90 border border-yellow-600/50"
                style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
              />
            ))}

            {POSTS.map((pt, i) => (
              <div
                key={`post${i}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400 border-2 border-yellow-700/70"
                style={{ left: pct(pt.x), top: pct(pt.y), width: '4.5%', aspectRatio: '1' }}
              />
            ))}
          </>
        )}

        {zones.map(z => {
          const on = value === z.option
          return (
            <button
              key={z.option}
              type="button"
              onClick={() => onChange(on ? '' : z.option)}
              aria-pressed={on}
              className={`absolute rounded-md border-2 transition-colors flex flex-col items-center justify-end pb-0.5 ${
                on
                  ? 'border-brand-gold-dark bg-brand-gold/80 shadow-sm'
                  : z.alliance === 'red'
                    ? 'border-red-300/80 bg-red-200/35 hover:bg-brand-gold/50'
                    : z.alliance === 'blue'
                      ? 'border-blue-300/80 bg-blue-200/35 hover:bg-brand-gold/50'
                      : 'border-white/80 bg-white/40 hover:bg-brand-gold/50'
              }`}
              style={{ left: pct(z.x), top: pct(z.y), width: pct(z.w), height: pct(z.h) }}
              title={`Tile ${z.option}`}
            >
              {/* Where the robot is, so the answer reads as a position on the
                  field rather than a highlighted rectangle. */}
              {on && (
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-brand-gold-dark border border-gray-700/40" />
              )}
              <span className={`text-[9px] font-bold leading-none ${on ? 'text-gray-900' : 'text-gray-600'}`}>
                {z.option}
              </span>
            </button>
          )
        })}

        {spots.map(sp => {
          const on = picked.includes(sp.option)
          return (
            <button
              key={sp.option}
              type="button"
              onClick={() => toggle(sp.option)}
              aria-pressed={on}
              title={sp.option}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex flex-col items-center justify-center transition-all ${
                on
                  ? 'border-brand-gold-dark bg-brand-gold text-gray-900 shadow-md scale-105'
                  : 'border-white bg-white/85 text-gray-600 hover:bg-brand-gold/60 shadow'
              }`}
              style={{ left: pct(sp.x), top: pct(sp.y), width: '14%', aspectRatio: '1' }}
            >
              <span className="text-[11px] leading-none" aria-hidden="true">{on ? '🌼' : '🌸'}</span>
              <span className="text-[7px] font-semibold leading-[1.05] text-center px-0.5">
                {sp.option}
              </span>
            </button>
          )
        })}

        {point && (
          // The robot, where it was put. The ring makes it findable against
          // the structures; the crosshair lines say which exact spot is meant,
          // since the square alone is wider than the tap that placed it.
          <>
            <div
              className="absolute pointer-events-none border-t border-brand-gold-dark/60"
              style={{ left: 0, right: 0, top: pct(point.y) }}
            />
            <div
              className="absolute pointer-events-none border-l border-brand-gold-dark/60"
              style={{ top: 0, bottom: 0, left: pct(point.x) }}
            />
            <div
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-md bg-brand-gold-dark border-2 border-gray-800/70 shadow"
              style={{ left: pct(point.x), top: pct(point.y), width: '11%', aspectRatio: '1' }}
            />
          </>
        )}

        {/* Which way round the field is. This is the whole reason the map
            exists: "Left" means nothing without knowing where you stand. In
            BIOBUZZ the alliances stand at the sides — red left, blue right —
            and the audience is along the bottom, which is how the drawing
            is oriented. */}
        <div className="absolute inset-y-0 left-0 w-1.5 bg-red-500/70 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-1.5 bg-blue-500/70 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-4 bg-gray-800/60 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] font-semibold text-white tracking-wide">
            AUDIENCE · RED LEFT · BLUE RIGHT
          </span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 mt-1">
        <p className="text-[11px] text-gray-400">
          {multi
            ? (picked.length
                ? `Owned ${picked.length} of ${options.length}: ${picked.join(', ')}.`
                : 'Tap each flower they finished owning. Leave it blank if they owned none.')
            : free
              ? (point
                  ? `${startLabel(value)} third of the field, red's side on the left. Tap again to move it.`
                  : 'Tap anywhere on the field where the robot lines up.')
              : (value
                  ? `Starts on tile ${value}, touching the wall. Red's side is the left half.`
                  : 'Tap the wall tile the robot starts on. Robots start against the wall on their own half, outside the loading zone.')}
        </p>
        {free && point && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[11px] text-gray-400 underline hover:text-gray-600 shrink-0"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
