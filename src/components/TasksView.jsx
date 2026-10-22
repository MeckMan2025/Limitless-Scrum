import { useState } from 'react'
import { isTeamAssignee } from '../lib/taskTeams'
import { Calendar, User, Zap } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../contexts/UserContext'
import RequestsBadge from './RequestsBadge'
import NotificationBell from './NotificationBell'

function TasksView({ tasksByTab, tabs }) {
  const { canReviewRequests, isGuest } = usePermissions()
  const { username } = useUser()
  const [filter, setFilter] = useState('all') // 'all' | 'mine'
  const boardTabs = tabs.filter(t => !t.type)

  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
  const filteredTasksByTab = {}
  for (const tab of boardTabs) {
    // Hide completed/done tasks here — they live in each board's own Completed section.
    const tasks = (tasksByTab[tab.id] || []).filter(t => t.status !== 'done' && t.status !== 'completed')
    const filtered = filter === 'mine'
      ? tasks.filter(t => t.assignee && t.assignee.toLowerCase() === username?.toLowerCase())
      : tasks
    filteredTasksByTab[tab.id] = [...filtered].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
    )
  }

  const totalTasks = boardTabs.reduce((sum, tab) => sum + (filteredTasksByTab[tab.id] || []).length, 0)

  const boardColors = [
    { border: 'border-brand-blue', text: 'text-brand-blue-dark' },
    { border: 'border-brand-yellow', text: 'text-brand-yellow-dark' },
    { border: 'border-brand-silver', text: 'text-brand-silver-dark' },
  ]

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-4 pl-14 md:pl-4 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              {filter === 'mine' ? 'My Tasks' : 'All Tasks'}
            </h1>
            <p className="text-sm text-gray-300">{totalTasks} task{totalTasks !== 1 ? 's' : ''} {filter === 'mine' ? 'assigned to you' : 'across all boards'}</p>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === 'all' ? 'bg-white text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('mine')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === 'mine' ? 'bg-white text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Mine
              </button>
            </div>
            <NotificationBell />
            {canReviewRequests && <RequestsBadge type="task" />}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {totalTasks === 0 ? (
          <div className="flex items-center justify-center h-[60vh]">
            <p className="text-gray-400">No tasks yet</p>
          </div>
        ) : (
          <div className="space-y-8 px-2 md:px-6">
            {boardTabs.map((tab, index) => {
              const tasks = filteredTasksByTab[tab.id] || []
              const color = boardColors[index % boardColors.length]
              return (
                <div key={tab.id}>
                  <h2 className={`text-lg font-bold ${color.text} mb-3 border-b-2 ${color.border} pb-2`}>
                    {tab.name}
                    <span className="ml-2 text-sm font-normal text-gray-400">({tasks.length})</span>
                  </h2>
                  {tasks.length === 0 ? (
                    <p className="text-sm text-gray-400 ml-2">No tasks</p>
                  ) : (
                    <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:snap-none">
                      {tasks.map(task => {
                        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'completed'
                        const isUpForGrabs = task.assignee === '__up_for_grabs__'
                        const isEveryone = task.assignee === '__everyone__' || isTeamAssignee(task.assignee)
                        const priorityBorder = {
                          critical: 'border-l-red-500',
                          high: 'border-l-orange-400',
                          medium: 'border-l-brand-yellow-dark',
                          low: 'border-l-gray-300',
                        }
                        const borderColor = isUpForGrabs
                          ? 'border-l-amber-400'
                          : isOverdue
                            ? 'border-l-red-400'
                            : (priorityBorder[task.priority] || priorityBorder.medium)
                        return (
                          <div
                            key={task.id}
                            className={`bg-white rounded-lg p-3 shadow-sm border-l-4 shrink-0 w-[220px] snap-center ${borderColor}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-medium text-gray-800 text-sm truncate">{task.title}</h3>
                            </div>
                            <span className="text-[10px] text-gray-400 capitalize">{task.status === 'todo' ? 'To Do' : (task.status === 'done' || task.status === 'completed') ? 'Done' : task.status + '%'}</span>

                            {task.description && (
                              <p className="text-xs text-gray-500 mb-1 line-clamp-3 mt-1">{task.description}</p>
                            )}

                            {task.skills && task.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {task.skills.map((skill, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-brand-silver/50 text-gray-600 rounded-full">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                              {isUpForGrabs ? (
                                <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                                  <Zap size={8} />
                                  Up for Grabs
                                </span>
                              ) : isEveryone ? (
                                <span className="flex items-center gap-0.5 text-brand-blue-dark font-medium">
                                  👥 Everyone
                                </span>
                              ) : task.assignee ? (
                                <span className="flex items-center gap-0.5">
                                  <User size={8} />
                                  {task.assignee}
                                </span>
                              ) : null}
                              {task.dueDate && (
                                <span className={`flex items-center gap-0.5 ${isOverdue ? 'text-red-400' : ''}`}>
                                  <Calendar size={8} />
                                  {task.dueDate}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default TasksView
