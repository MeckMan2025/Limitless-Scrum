import { createPortal } from 'react-dom'
import { assigneeLabel } from '../lib/taskTeams'
import { X, Calendar, User, Pencil, Zap, LifeBuoy, UserPlus } from 'lucide-react'

// Read-only task details — anyone can open a task and read everything; the
// Edit button appears only for people who can actually edit.
const UP_FOR_GRABS = '__up_for_grabs__'

const PRIORITY_CHIP = {
  critical: 'bg-red-100 text-red-600',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-brand-yellow/40 text-pink-700',
  low: 'bg-gray-100 text-gray-700',
}
const STATUS_LABEL = { todo: 'To Do', 25: '25%', 50: '50%', 75: '75%', 'in-progress': 'In Progress', done: 'Done', completed: 'Done' }

export default function TaskDetailModal({ task, onClose, onEdit, onMove }) {
  if (!task) return null
  const assignee = assigneeLabel(task.assignee)

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[90]" onClick={onClose} />
      <div className="fixed inset-0 z-[91] flex items-center justify-center pointer-events-none p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden">
          <div className="px-4 py-3 flex items-start gap-2 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-800 flex-1">{task.title}</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 shrink-0">
              <X size={16} className="text-gray-500" />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_CHIP[task.priority] || PRIORITY_CHIP.medium}`}>
                {task.priority || 'medium'} priority
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-blue/30 text-gray-700">
                {STATUS_LABEL[task.status] || task.status}
              </span>
            </div>

            <div className="text-sm text-gray-600 space-y-1.5">
              <p className="flex items-center gap-2"><User size={13} className="text-gray-600" /> {assignee}</p>
              {task.dueDate && <p className="flex items-center gap-2"><Calendar size={13} className="text-gray-600" /> Due {task.dueDate}</p>}
              <p className="flex items-center gap-2">
                <UserPlus size={13} className="text-gray-600" /> Assigned by{' '}
                {task.assignedBy
                  ? <span className="font-medium">{task.assignedBy}</span>
                  : <span className="italic text-gray-500">unknown</span>}
              </p>
              {task.mentor && (
                <p className="flex items-center gap-2">
                  <LifeBuoy size={13} className="text-brand-yellow-dark" /> Stuck? Ask <span className="font-medium">{task.mentor}</span>
                </p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600 mb-1">Description</p>
              {task.description
                ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
                : <p className="text-sm italic text-gray-500">No description</p>}
            </div>

            {(task.skills || []).length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600 mb-1 flex items-center gap-1"><Zap size={11} /> Skills</p>
                <div className="flex flex-wrap gap-1">
                  {task.skills.map(sk => (
                    <span key={sk} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{sk}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {onMove && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600 mb-1">Move to</p>
              <div className="flex gap-1.5">
                {[['todo', 'To Do'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['done', 'Done']].map(([st, label]) => (
                  <button
                    key={st}
                    onClick={() => st !== task.status && onMove(st)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      task.status === st ? 'bg-brand-blue-dark text-white' : 'bg-gray-100 text-gray-700 hover:bg-brand-blue/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onEdit && (
            <div className="px-4 pb-4">
              <button
                onClick={onEdit}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-brand-blue/40 hover:bg-brand-blue text-brand-black transition-colors"
              >
                <Pencil size={13} /> Edit Task
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
