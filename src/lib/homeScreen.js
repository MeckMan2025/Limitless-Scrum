import { teamDoc } from './teamDoc'

// How the home screen looks, for the whole team: which widgets are hidden and
// what is behind them. Leads change it from the home screen itself ("Edit home
// screen"); it is the team's (teamDoc.js), so it is the same for everyone on
// every computer and changes on all of them at once.

export const HOME_WIDGETS = [
  { key: 'week', label: 'This Week' },
  { key: 'shortcuts', label: 'Shortcut tiles' },
  { key: 'tasks', label: 'My Tasks' },
  { key: 'goals', label: 'Our Goals' },
  { key: 'compDay', label: 'Competition day' },
  { key: 'gallery', label: 'Notebook photos' },
  { key: 'quote', label: 'Quote' },
]

// The home screen's original background, also behind the competition day board.
//
// Honeycomb, after the BioBuzz comb: flat-top cells in mixed honey tones. The
// logo's black walls are what make it read as a badge; behind a page of text
// that would fight everything on top of it, so the walls here are soft amber
// and the whole thing is faint. Generated flat-top hexagons on a 3r x sqrt(3)r
// tile, which is the smallest patch of a honeycomb that repeats seamlessly.
export const HONEYCOMB_CELLS = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='52' viewBox='0 0 90.00 51.96'%3E%3Cpolygon points='30.00,25.98 15.00,51.96 -15.00,51.96 -30.00,25.98 -15.00,0.00 15.00,0.00' fill='%23fde68a' fill-opacity='0.55'/%3E%3Cpolygon points='75.00,0.00 60.00,25.98 30.00,25.98 15.00,0.00 30.00,-25.98 60.00,-25.98' fill='%23fef3c7' fill-opacity='0.55'/%3E%3Cpolygon points='75.00,51.96 60.00,77.94 30.00,77.94 15.00,51.96 30.00,25.98 60.00,25.98' fill='%23fef3c7' fill-opacity='0.55'/%3E%3Cpolygon points='120.00,25.98 105.00,51.96 75.00,51.96 60.00,25.98 75.00,0.00 105.00,0.00' fill='%23f8d77a' fill-opacity='0.55'/%3E%3Cpolygon points='30.00,25.98 15.00,51.96 -15.00,51.96 -30.00,25.98 -15.00,0.00 15.00,0.00' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3Cpolygon points='75.00,0.00 60.00,25.98 30.00,25.98 15.00,0.00 30.00,-25.98 60.00,-25.98' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3Cpolygon points='75.00,51.96 60.00,77.94 30.00,77.94 15.00,51.96 30.00,25.98 60.00,25.98' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3Cpolygon points='120.00,25.98 105.00,51.96 75.00,51.96 60.00,25.98 75.00,0.00 105.00,0.00' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3C/svg%3E\")"

// The honey the comb sits in.
export const HONEY_WASH = 'linear-gradient(160deg, #fffdf5 0%, #fff8e7 45%, #fdf0d5 100%)'

export const BACKGROUND_PRESETS = [
  { key: 'honeycomb', label: 'Honeycomb', css: { backgroundImage: `${HONEYCOMB_CELLS}, ${HONEY_WASH}` } },
  { key: 'night', label: 'Night', css: { backgroundImage: 'linear-gradient(160deg, #0B0F1A 0%, #101B3A 50%, #0B0F1A 100%)' } },
  { key: 'sky', label: 'Sky', css: { backgroundImage: 'linear-gradient(160deg, #f7faff 0%, #e8efff 55%, #dbe6ff 100%)' } },
  { key: 'silver', label: 'Silver', css: { backgroundImage: 'linear-gradient(160deg, #fafafa 0%, #eceef2 55%, #dfe3ea 100%)' } },
]

const doc = teamDoc('home_screen', 'scrum-home-screen')

// { hidden: { week: true, ... }, background: { kind, ... } }
export const useHomeScreen = () => doc.use()

export function setWidgetHidden(key, hidden) {
  const cur = doc.get()
  return doc.set({ ...cur, hidden: { ...(cur.hidden || {}), [key]: !!hidden } })
}

// { kind: 'preset', preset: 'night' } | { kind: 'color', color: '#123456' }
// | { kind: 'image', url }
export function setBackground(background) {
  return doc.set({ ...doc.get(), background })
}

// The style for the home screen's scrolling area.
export function backgroundStyle(bg) {
  if (bg?.kind === 'color' && /^#[0-9a-f]{6}$/i.test(bg.color || '')) return { backgroundColor: bg.color }
  if (bg?.kind === 'image' && bg.url) {
    return { backgroundImage: `url("${String(bg.url).replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  const preset = BACKGROUND_PRESETS.find(p => p.key === bg?.preset) || BACKGROUND_PRESETS[0]
  return { ...preset.css, backgroundAttachment: 'local' }
}
