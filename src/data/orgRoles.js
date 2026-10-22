// Role catalog for the Org Chart. The team is three equal departments —
// Business, Hardware, Software. People are placed into a role box by matching
// function_tags. Descriptions power the hover tooltips.
//
// Note on lead tags: the chart labels the hardware lead "Hardware", but the
// underlying tag is still 'Technical Lead', and the software lead's is still
// 'Programming Lead'. Those tag strings are checked by usePermissions and by
// the deployed admin-* edge functions, so renaming them is a coordinated change
// and not just a relabel.

export const BUSINESS_ROLES = [
  { tag: 'Communications', desc: 'Team communications, emails, the team website, and social media.' },
  { tag: 'Finance', desc: 'Budget, fundraising, and reimbursements.' },
  { tag: 'Outreach', desc: 'Community events and STEM outreach.' },
]

// Hardware (blue) and Software (green) stand beside Business, not under a
// shared "Technical" umbrella — there is no lead above the two of them.
export const TECHNICAL_GROUPS = [
  {
    key: 'hardware', label: 'Hardware', color: 'blue',
    leadTag: 'Technical Lead',
    coLeadTag: 'Co-Technical Lead',
    roles: [
      { tag: 'CAD', desc: 'Designs robot parts and assemblies in 3D CAD.' },
      { tag: 'Assembly/Building', desc: 'Fabricates and assembles the physical robot.' },
      { tag: 'Wiring', desc: 'Wires motors, sensors, and manages the electronics.' },
    ],
  },
  {
    key: 'software', label: 'Software', color: 'green',
    leadTag: 'Programming Lead',
    coLeadTag: 'Co-Programming Lead',
    roles: [
      { tag: 'Programming', desc: 'Writes autonomous and driver-control code.' },
      { tag: 'Scouting', desc: 'Collects and analyzes match data on other teams.' },
    ],
  },
]

// Flattened technical roles (used for catalog/extra-tag detection).
export const TECHNICAL_ROLES = TECHNICAL_GROUPS.flatMap(g => g.roles)

// The three departments, side by side and equal. Each owns its own lead.
export const DEPARTMENTS = [
  { key: 'business', label: 'Business', color: 'orange', leadTag: 'Business Lead', coLeadTag: 'Co-Business Lead', roles: BUSINESS_ROLES },
  ...TECHNICAL_GROUPS.map(g => ({ key: g.key, label: g.label, color: g.color, leadTag: g.leadTag, coLeadTag: g.coLeadTag, roles: g.roles })),
]

// Leadership / support role descriptions (tooltips for those sections)
export const LEAD_DESC = {
  'Business Lead': 'Leads the business subteam and its members.',
  'Technical Lead': 'Leads the hardware side — CAD, assembly, and wiring.',
  'Programming Lead': 'Leads the software side — programming and scouting.',
  'Project Manager': 'Coordinates timelines, tasks, and the whole team.',
  'Co-Business Lead': 'Shares the Business Lead job.',
  'Co-Technical Lead': 'Shares the Hardware lead job.',
  'Co-Programming Lead': 'Shares the Software lead job.',
  'Co-Project Manager': 'Shares the Project Manager job.',
  'Co-Founder': 'Founded and oversees the team.',
  'Mentor': 'Adult mentor guiding the team.',
  'Coach': 'Team coach and adult supervisor.',
}

// Tags that describe leadership/standing, NOT a functional role box.
export const LEADERSHIP_TAGS = new Set([
  'Co-Founder', 'Coach', 'Mentor', 'Team Lead', 'Project Manager',
  'Business Lead', 'Technical Lead', 'Programming Lead', 'Team', 'Business', 'Technical',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead',
])

// Build a { tag -> description } lookup from everything above.
export const ROLE_DESC = (() => {
  const m = {}
  for (const r of [...BUSINESS_ROLES, ...TECHNICAL_ROLES]) m[r.tag] = r.desc
  for (const [k, v] of Object.entries(LEAD_DESC)) m[k] = v
  return m
})()
