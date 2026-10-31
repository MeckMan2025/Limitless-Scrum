import { Calendar, User, Pencil, Trash2, Zap, LogOut, Hand, CheckCircle, LifeBuoy } from 'lucide-react'
import { isTeamAssignee, teamLabel, SIDES } from '../lib/taskTeams'

const UP_FOR_GRABS = '__up_for_grabs__'
const EVERYONE = '__everyone__'

function TaskCard({ task, isDragging, onEdit, onDelete, canEdit, onOpen, onClaim, onLeaveTask, onMarkDone, currentUser, isGuest, leaveIsImmediate = false }) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'
  const isUpForGrabs = task.assignee === UP_FOR_GRABS
  const isEveryone = task.assignee === EVERYONE
  // A task can be on several people now, so it is mine if I'm anywhere on it.
  const onIt = task.assignees?.length ? task.assignees : [task.assignee].filter(Boolean)
  const isAssignedToMe = currentUser && onIt.some(a => a?.toLowerCase() === currentUser.toLowerCase())

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
      onClick={onOpen}
      className={`bg-white rounded-lg p-3 mb-2 shadow-sm border-l-4 transition-shadow cursor-pointer select-none ${
        isDragging ? 'shadow-lg' : 'hover:shadow-md'
      } ${borderColor}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-gray-800 flex-1">{task.title}</h3>
        {canEdit && (
          <div className="flex gap-1 ml-2">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1 text-gray-500 hover:text-brand-blue-ink rounded"
            >
              <Pencil size={14} />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1 text-gray-500 hover:text-red-600 rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-3">
          {isUpForGrabs ? (
            <span className="flex items-center gap-1 text-amber-700 font-medium">
              <Zap size={12} />
              Up for Grabs
            </span>
          ) : isEveryone ? (
            <span className="flex items-center gap-1 text-brand-blue-ink font-medium">
              👥 Everyone
            </span>
          ) : isTeamAssignee(task.assignee) ? (
            <span className="flex items-center gap-1 text-brand-blue-ink font-medium">
              {teamLabel(task.assignee)}
            </span>
          ) : onIt.length > 0 ? (
            <span
              className="flex items-center gap-1"
              title={onIt.join(', ')}
            >
              <User size={12} />
              {/* The rest are counted rather than listed, so a task on five
                  people doesn't push everything else off the card. */}
              {onIt[0]}{onIt.length > 1 && ` +${onIt.length - 1}`}
            </span>
          ) : null}
          {/* Which sides this one belongs to. On more than one it is the same
              task on each of their boards, so say so — otherwise it reads as a
              duplicate to whoever finds it twice. */}
          {task.sides?.length > 0 && (() => {
            const on = SIDES.filter(side => task.sides.includes(side.key))
            if (on.length === 0) return null
            return (
              <span
                className="flex items-center gap-1 text-brand-blue-ink font-medium"
                title={on.length > 1
                  ? `Shared with ${on.length} boards — progress moves on all of them`
                  : on[0].label}
              >
                {on.map(side => side.emoji).join(' ')}
                {on.length > 1 ? ' shared' : ` ${on[0].label}`}
              </span>
            )
          })()}
          {task.dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
              <Calendar size={12} />
              {task.dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Mark Done button — only in Done column */}
      {task.status === 'done' && !isGuest && onMarkDone && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMarkDone(task.id) }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg transition-colors"
        >
          <CheckCircle size={12} />
          Mark Done
        </button>
      )}

      {/* Claim button for non-guests on Up for Grabs tasks */}
      {isUpForGrabs && !isGuest && onClaim && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClaim(task.id) }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium rounded-lg transition-colors"
        >
          <Hand size={12} />
          Claim Task
        </button>
      )}

      {/* Leaving the task. A lead does it; everyone else asks, so the button
          says which one is about to happen. */}
      {isAssignedToMe && !isUpForGrabs && onLeaveTask && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onLeaveTask(task) }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
        >
          <LogOut size={12} />
          {leaveIsImmediate ? 'Leave Task' : 'Request to Leave'}
        </button>
      )}
    </div>
  )
}

export default TaskCard
