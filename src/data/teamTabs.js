// What a visiting team can reach, in one place.
//
// App.jsx enforces this list and TeamHomeView explains it. They used to be
// written out separately, and drifted: the welcome screen was still offering
// Chat, Scouting, Data and the AI Manual long after teams stopped having any
// of them. A team being told about a tab that is not there is worse than not
// being told at all — they go looking for it and conclude the app is broken.
//
// Adding a tab here is the only change needed; the guide follows.

export const TEAM_TABS = [
  {
    id: 'home',
    name: 'Home',
    icon: 'Home',
    description: 'Where you are now — your team, and anything new.',
  },
  {
    id: 'boards',
    name: 'Boards',
    icon: 'FolderKanban',
    description: 'Your scrum boards. Make tasks, drag them along as they get done. Only your team can see them.',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    icon: 'Calendar',
    description: 'Meetings, competitions and deadlines.',
  },
  {
    id: 'user-management',
    name: 'User Management',
    icon: 'Shield',
    description: 'Add your own members and mentors. Your coach runs this — nobody outside your team appears here.',
  },
  {
    id: 'suggestions',
    name: 'Suggestions',
    icon: 'Lightbulb',
    description: 'Tell us what would make this better. We read them.',
  },
  {
    id: 'profile',
    name: 'Profile',
    icon: 'User',
    description: 'Your own details.',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: 'Settings',
    description: 'Theme, notifications, and signing out.',
  },
]

export const TEAM_TAB_IDS = TEAM_TABS.map(t => t.id)
