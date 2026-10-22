// Maps a member's function_tags to their "side(s)" and produces a tie-dye /
// marbled color style when they belong to more than one side.
//
// Sides:
//   pink   = Leadership / Mentorship (Mentor, Coach, Co-Founder, Project Manager)
//   orange = Business                (Business, Business Lead, Outreach, Communications, Social Media)
//   blue   = Technical               (Technical Lead, Programming, CAD, Build, Scouting)

export const SIDE_HEX = {
  pink: '#ec4899',
  orange: '#f59e0b',
  blue: '#3b82f6',
}

export const SIDE_LABEL = {
  pink: 'Leadership',
  orange: 'Business',
  blue: 'Technical',
}

const TAG_SIDE = {
  'Mentor': 'pink',
  'Coach': 'pink',
  'Co-Founder': 'pink',
  'Project Manager': 'pink',
  'Co-Project Manager': 'pink',
  'Business': 'orange',
  'Business Lead': 'orange',
  'Co-Business Lead': 'orange',
  'Communications': 'orange',
  'Finance': 'orange',
  'Outreach': 'orange',
  'Technical Lead': 'blue',
  'Co-Technical Lead': 'blue',
  'Co-Programming Lead': 'blue',
  'CAD': 'blue',
  'Assembly/Building': 'blue',
  'Wiring': 'blue',
  'Programming': 'blue',
  'Scouting': 'blue',
}

// Fixed order so the same person always renders the same swirl.
const SIDE_ORDER = ['pink', 'orange', 'blue']

// Return the distinct sides a member belongs to, e.g. ['blue', 'pink'].
export function getSides(functionTags) {
  const tags = functionTags || []
  const found = new Set()
  for (const t of tags) {
    const side = TAG_SIDE[t]
    if (side) found.add(side)
  }
  return SIDE_ORDER.filter(s => found.has(s))
}

// Human label for the side(s), e.g. "Technical + Leadership".
export function getSideLabel(functionTags) {
  const sides = getSides(functionTags)
  if (sides.length === 0) return 'Unassigned'
  return sides.map(s => SIDE_LABEL[s]).join(' + ')
}

// CSS `style` object producing a solid color (1 side) or a marbled tie-dye
// blend (2-3 sides) — distinct pools of paint that bleed into each other at
// the edges rather than mixing into one flat new color.
export function getSideStyle(functionTags) {
  const sides = getSides(functionTags)
  const c = sides.map(s => SIDE_HEX[s])

  if (c.length === 0) {
    return { background: 'linear-gradient(135deg, #e5e7eb, #cbd5e1)' }
  }
  if (c.length === 1) {
    return { background: `radial-gradient(circle at 35% 30%, ${c[0]}, ${c[0]}cc)` }
  }

  // Soft radial "paint pools", each a distinct color fading to transparent,
  // layered over a swirled conic base of the same colors.
  const spots = [
    `radial-gradient(circle at 26% 28%, ${c[0]}f2 0%, ${c[0]}00 46%)`,
    `radial-gradient(circle at 76% 32%, ${c[1]}f2 0%, ${c[1]}00 46%)`,
  ]
  if (c[2]) spots.push(`radial-gradient(circle at 50% 82%, ${c[2]}f2 0%, ${c[2]}00 50%)`)
  const conic = `conic-gradient(from 25deg at 50% 50%, ${[...c, c[0]].join(', ')})`
  return { background: [...spots, conic].join(', ') }
}
