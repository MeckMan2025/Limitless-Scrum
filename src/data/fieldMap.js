// The field, as a picture a scout can tap.
//
// Starting position was three strips labelled Left, Middle and Right. The
// trouble with words is whose left: a scout standing behind the opposite
// alliance wall reads them backwards, and nobody notices until the data is
// being used to pick an alliance. A picture with the driver station drawn on
// it has no left to get wrong.
//
// Everything here is coordinates, so the map can be corrected without touching
// the component that draws it. Numbers are fractions of the field — x across
// from the left wall, y down from the far wall to your driver station — so
// they hold whatever size the map is drawn at.
//
// The layout below is traced off the field drawing: a square field of tiles,
// four structures in the middle (two red on the left, two blue on the right)
// with a pair of bars between them, gold posts out near the middle of each
// wall, and the alliance zones against the left and right walls.

// The real overhead picture of the field: Figure 9-2 of the 2026-2027
// BIOBUZZ Competition Manual (TU05), cropped to the inside of the perimeter
// walls and squared. Red alliance area is off the left edge, blue off the
// right, audience along the bottom. The zones and flowers below are laid on
// top of it. If it fails to load (a venue with no signal and an empty cache)
// the field is drawn from the coordinates in this file instead.
export const FIELD_IMAGE = '/field/field.png'

export const FIELD = {
  aspect: 1,   // square, as the drawing is
  tiles: 6,    // the tile grid, for the faint lines
}

// The four structures in the middle. Red pair on the left, blue pair on the
// right, each stacked near side and far side.
export const STRUCTURES = [
  { key: 'red-far',   alliance: 'red',  x: 0.330, y: 0.335, w: 0.170, h: 0.145 },
  { key: 'red-near',  alliance: 'red',  x: 0.330, y: 0.500, w: 0.170, h: 0.145 },
  { key: 'blue-far',  alliance: 'blue', x: 0.525, y: 0.345, w: 0.140, h: 0.125 },
  { key: 'blue-near', alliance: 'blue', x: 0.525, y: 0.520, w: 0.140, h: 0.110 },
]

// The two bars that run between the structures.
export const BARS = [
  { x: 0.425, y: 0.455, w: 0.195, h: 0.030 },
  { x: 0.440, y: 0.500, w: 0.195, h: 0.030 },
]

// The gold posts, one out from the middle of each wall.
export const POSTS = [
  { x: 0.345, y: 0.030 },
  { x: 0.985, y: 0.355 },
  { x: 0.665, y: 0.965 },
  { x: 0.025, y: 0.645 },
]

// The alliance zones against the walls: red on the left, blue on the right,
// each with its strip in the corner diagonally opposite.
export const ALLIANCE_ZONES = [
  { alliance: 'red',  x: 0.000, y: 0.200, w: 0.090, h: 0.105 },
  { alliance: 'red',  x: 0.030, y: 0.950, w: 0.140, h: 0.030 },
  { alliance: 'blue', x: 0.910, y: 0.670, w: 0.090, h: 0.130 },
  { alliance: 'blue', x: 0.830, y: 0.012, w: 0.140, h: 0.028 },
]

// ── Where a robot started ──────────────────────────────────────────────────
//
// Three areas along your own wall, which is where a robot can line up. Keyed
// by the option exactly as scoutingFields.js lists it, so the value saved is
// unchanged — existing matches, the table, the CSV and the averages all still
// read the same three words.
//
// BIOBUZZ (Competition Manual G304): a ROBOT starts fully on its own
// ALLIANCE's half — tile columns A, B, C for red, D, E, F for blue — touching
// the perimeter wall, not in the LOADING ZONE, and not touching a FLOWER. So
// the legal starts are the wall tiles of your own half, minus the loading
// zone tile. Named by the field's own tile grid (Figure 9-5): columns A–F
// left to right, rows 1–6 from the audience wall up. Red's loading zone is
// A5, blue's is F2; those two are left out.
//
// Each zone is the whole tile, so a tap anywhere on the tile the robot is
// touching is the answer, and the saved value is the tile's name.
const TILE = 1 / 6
const tile = (col, row, alliance) => ({
  x: 'ABCDEF'.indexOf(col) * TILE,
  y: (6 - row) * TILE,
  w: TILE, h: TILE, alliance,
})
export const START_TILES = {
  // Red: top wall, left wall (A5 is the loading zone), bottom wall
  A6: tile('A', 6, 'red'), B6: tile('B', 6, 'red'), C6: tile('C', 6, 'red'),
  A4: tile('A', 4, 'red'), A3: tile('A', 3, 'red'), A2: tile('A', 2, 'red'),
  A1: tile('A', 1, 'red'), B1: tile('B', 1, 'red'), C1: tile('C', 1, 'red'),
  // Blue: top wall, right wall (F2 is the loading zone), bottom wall
  D6: tile('D', 6, 'blue'), E6: tile('E', 6, 'blue'), F6: tile('F', 6, 'blue'),
  F5: tile('F', 5, 'blue'), F4: tile('F', 4, 'blue'), F3: tile('F', 3, 'blue'),
  F1: tile('F', 1, 'blue'), D1: tile('D', 1, 'blue'), E1: tile('E', 1, 'blue'),
}
export const START_TILE_OPTIONS = Object.keys(START_TILES)

export const START_ZONES = {
  ...START_TILES,
  // The three words from before the tiles, kept so older matches still read.
  Left:   { x: 0.055, y: 0.730, w: 0.265, h: 0.165 },
  Middle: { x: 0.368, y: 0.730, w: 0.265, h: 0.165 },
  Right:  { x: 0.680, y: 0.730, w: 0.265, h: 0.165 },
}

// Any option without a box above gets an even share of the same strip, so
// changing the options in scoutingFields.js cannot leave the map blank.
export function zonesFor(options = []) {
  const known = options.filter(o => START_ZONES[o])
  if (known.length === options.length) {
    return options.map(o => ({ option: o, ...START_ZONES[o] }))
  }
  const gap = 0.03
  const w = (0.89 - gap * (options.length - 1)) / options.length
  return options.map((o, i) => ({
    option: o,
    x: 0.055 + i * (w + gap),
    y: 0.730,
    w,
    h: 0.165,
  }))
}

// ── The flowers ────────────────────────────────────────────────────────────
//
// Which ones a team finished owning is a fact about places on the field, so it
// is asked the same way as the start: by pointing at them. Four words in a row
// get ticked in the wrong order by a tired scout at the end of a match; four
// marks standing where the flowers stand do not, because the scout is looking
// straight at them.
//
// In BIOBUZZ the four FLOWERS are mounted on the perimeter walls, one per
// wall, offset from the middle: left wall (red side, nearer the audience),
// top wall (far side, towards red), bottom wall (audience side, towards blue)
// and right wall (blue side, nearer the far end). Read left to right across
// the field: left wall, top, bottom, right wall. Positions traced off the
// manual's overhead drawing; the words saved are unchanged.
//
// The marks are pulled a little in from the wall so the whole tap target sits
// on the field: a circle centred on the wall itself is half outside the map
// and half under the edge labels, and a thumb misses it.
export const FLOWER_SPOTS = {
  'Left':         { x: 0.075, y: 0.667 },
  'Centre Left':  { x: 0.334, y: 0.080 },
  'Centre Right': { x: 0.662, y: 0.905 },
  'Right':        { x: 0.925, y: 0.335 },
}

export function spotsFor(options = []) {
  if (options.every(o => FLOWER_SPOTS[o])) {
    return options.map(o => ({ option: o, ...FLOWER_SPOTS[o] }))
  }
  const step = 1 / (options.length + 1)
  return options.map((o, i) => ({ option: o, x: step * (i + 1), y: 0.45 }))
}

// ── Reading a starting position back ───────────────────────────────────────
//
// A start is now a point anywhere on the field, stored as "x,y" in percent.
// Two older shapes have to keep working: matches scouted when the answer was
// the word Left, Middle or Right, and anything else somebody typed in. Those
// words are read as the middle of the area they used to mean, so an old match
// still shows a dot in roughly the right place.
export function pointOf(value) {
  if (typeof value !== 'string') return null
  const m = value.match(/^\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*$/)
  if (m) {
    const clamp = (n) => Math.max(0, Math.min(1, n / 100))
    return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) }
  }
  const z = START_ZONES[value.trim()]
  return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null
}

// The side of the field a start is on, for counting.
//
// "Usual start" is the commonest answer across a team's matches, and once
// every answer is an exact point no two are ever the same — every team would
// show one arbitrary dot seen once. Counting the third of the field it falls
// in gives that back, and gives the same three words as before, so matches
// scouted under the old question count alongside the new ones.
export function startLabel(value) {
  const v = typeof value === 'string' ? value.trim() : ''
  if (START_TILES[v]) return v   // a tile is already the name worth counting
  const p = pointOf(value)
  if (!p) return v
  return p.x < 1 / 3 ? 'Left' : p.x < 2 / 3 ? 'Middle' : 'Right'
}
