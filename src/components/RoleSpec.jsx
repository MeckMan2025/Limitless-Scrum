import { useState } from 'react'
import NotificationBell from './NotificationBell'
import RoleDashboard from './RoleDashboard'
import FinanceDashboard from './FinanceDashboard'
import CommsDashboard from './CommsDashboard'
import RobotDashboard from './RobotDashboard'
import SoftwareDashboard from './SoftwareDashboard'
import { useRoleTrackers } from '../hooks/useRoleTrackers'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../contexts/UserContext'
import { DASHBOARD_ROLES, SIDE_THEME, sideForRole } from '../data/roleTrackers'

// RoleSpec — one Data subtab holding every role's PUBLIC trackers, with the
// roles as pills inside. People with the role (or leads) can edit; others view.
export default function RoleSpec() {
  const [role, setRole] = useState(DASHBOARD_ROLES[0].role)
  const { trackers, loading, upsertTracker, removeTracker } = useRoleTrackers()
  const { hasLeadTag } = usePermissions()
  const { functionTags } = useUser()
  const canManage = hasLeadTag || (functionTags || []).includes(role)

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 pl-14 md:pl-4 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              RoleSpec
            </h1>
            <p className="text-sm text-gray-300">Public trackers by role</p>
          </div>
          <NotificationBell />
        </div>
        {/* Role pills */}
        <div className="px-4 pb-2 pl-14 md:pl-4 flex gap-1.5 overflow-x-auto text-gray-200">
          {DASHBOARD_ROLES.map(({ role: r }) => {
            const theme = SIDE_THEME[sideForRole(r)]
            const active = role === r
            return (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${active ? `${theme.chip} ring-2 ring-offset-1 ${theme.ring}` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {r}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <p className="text-center text-gray-400 mt-10 animate-pulse">Loading…</p>
          ) : role === 'Finance' ? (
            <FinanceDashboard editable={canManage} publicOnly />
          ) : role === 'Communications' ? (
            <CommsDashboard editable={canManage} publicOnly />
          ) : ['CAD', 'Assembly/Building', 'Wiring'].includes(role) ? (
            <RobotDashboard editable={canManage} publicOnly />
          ) : role === 'Programming' ? (
            <SoftwareDashboard editable={canManage} publicOnly />
          ) : (
            <RoleDashboard
              role={role}
              trackers={trackers}
              upsertTracker={upsertTracker}
              removeTracker={removeTracker}
              editable={canManage}
              publicOnly
            />
          )}
        </div>
      </main>
    </div>
  )
}
