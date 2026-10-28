import { useMemberNames, useMentorNames } from '../hooks/useMemberNames'
import { SIDES, boardsForSides, UP_FOR_GRABS, EVERYONE } from '../lib/taskTeams'
import { useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'

// These two answer "who's on it" by themselves, so picking one clears the names.
const SPECIALS = [
  { value: UP_FOR_GRABS, label: '🙋 Up for Grabs' },
  { value: EVERYONE, label: '👥 Everyone (whole team)' },
]
const isSpecial = (v) => SPECIALS.some(sp => sp.value === v)

const SKILL_OPTIONS = [
  'Programming', 'CAD', 'Mechanical', 'Electronics', 'Design',
  'Presentation', 'Testing', 'Documentation', 'Business', 'Strategy'
]


function TaskModal({ task, onSave, onClose, requestMode, isLead, isTeam, backToPerson, onBackToPerson }) {
  const memberNames = useMemberNames()
  const mentorNames = useMentorNames()
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    // One list for everyone on the task. Older tasks carry a single name.
    assignees: task?.assignees?.length
      ? task.assignees
      : [task?.assignee].filter(Boolean),
    sides: task?.sides || [],
    dueDate: task?.dueDate || '',
    mentor: task?.mentor || '',
    skills: task?.skills || [],
    priority: task?.priority || 'medium',
  })
  const [showErrors, setShowErrors] = useState(false)

  // Everything but the mentor is required to make a task.
  const titleMissing = !formData.title.trim()
  const descriptionMissing = !formData.description.trim()
  // A task needs someone to own it: a person, or at least one side of the
  // team. Picking sides is the way to give it to more than one at once.
  const assigneeMissing = formData.assignees.length === 0 && formData.sides.length === 0
  const dueDateMissing = !formData.dueDate
  // A mentor is optional: plenty of tasks are ordinary enough that there is
  // nobody in particular to go to, and requiring one meant picking someone
  // arbitrary just to get past the form.
  const hasErrors = titleMissing || descriptionMissing || assigneeMissing || dueDateMissing

  const handleSubmit = (e) => {
    e.preventDefault()
    if (hasErrors) {
      setShowErrors(true)
      return
    }

    if (!task && localStorage.getItem('scrum-sfx-enabled') !== 'false') {
      new Audio(`${import.meta.env.BASE_URL}sounds/click.mp3`).play().catch(() => {})
    }

    onSave({
      ...task,
      ...formData,
      // assignee stays the first name on the list, so everything that still
      // reads a single assignee keeps working.
      assignee: formData.assignees[0] || '',
      // Recomputed here because the sides may have just changed, and the
      // boards a task shows on follow straight from them.
      boardIds: formData.sides.length
        ? boardsForSides(formData.sides)
        : [task?.boardId].filter(Boolean),
      id: task?.id,
    })
  }

  // Names that were on the task before they left the roster stay listed, so
  // editing something else doesn't quietly drop them off it.
  const chosenPeople = formData.assignees.filter(a => !isSpecial(a))
  const people = [...memberNames, ...chosenPeople.filter(n => !memberNames.includes(n))]

  const togglePerson = (name) => {
    setFormData(prev => {
      const withoutSpecials = prev.assignees.filter(a => !isSpecial(a))
      return {
        ...prev,
        assignees: withoutSpecials.includes(name)
          ? withoutSpecials.filter(a => a !== name)
          : [...withoutSpecials, name],
      }
    })
  }

  const setSpecial = (value) => {
    setFormData(prev => ({
      ...prev,
      assignees: prev.assignees[0] === value ? [] : [value],
    }))
  }

  const toggleSide = (key) => {
    setFormData(prev => ({
      ...prev,
      sides: prev.sides.includes(key)
        ? prev.sides.filter(s => s !== key)
        : [...prev.sides, key],
    }))
  }

  const toggleSkill = (skill) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill],
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="min-w-0">
            {/* Only when this was opened from someone's task page. */}
            {backToPerson && (
              <button
                type="button"
                onClick={onBackToPerson}
                className="flex items-center gap-1 text-xs font-semibold text-brand-blue-dark hover:underline mb-0.5"
              >
                <ArrowLeft size={12} /> Back to {backToPerson}'s tasks
              </button>
            )}
            <h2 className="text-lg font-semibold">
              {task ? 'Edit Task' : requestMode ? 'Request Task' : 'Add New Task'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              placeholder="Enter task title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value })
                if (showErrors && e.target.value.trim()) setShowErrors(false)
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent ${
                showErrors && descriptionMissing ? 'border-red-500' : ''
              }`}
              placeholder="Describe the task"
              rows={3}
            />
            {showErrors && descriptionMissing && (
              <p className="text-red-500 text-sm mt-1">Description is required</p>
            )}
          </div>

          <div>
            {/* Picking sides is how a task goes to more than one part of the
                team: it becomes one task sitting on each of their boards. */}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sides of the team{' '}
              <span className="text-xs font-normal text-gray-400">(it shows on each one's board)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SIDES.map(side => (
                <button
                  key={side.key}
                  type="button"
                  onClick={() => toggleSide(side.key)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    formData.sides.includes(side.key)
                      ? 'bg-brand-blue text-gray-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {side.emoji} {side.label}
                </button>
              ))}
            </div>
            {formData.sides.length > 1 && (
              <p className="text-xs text-gray-400 mt-1">
                One task on {formData.sides.length} boards — moving it along on any of them moves it on all of them.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Who's on it {formData.sides.length === 0 && '*'}{' '}
                <span className="text-xs font-normal text-gray-400">(tick as many as you need)</span>
              </label>

              {/* Up for Grabs and Everyone are the whole answer on their own, so
                  they clear the names rather than sit alongside them. */}
              <div className="flex flex-wrap gap-2 mb-2">
                {SPECIALS.map(sp => (
                  <button
                    key={sp.value}
                    type="button"
                    onClick={() => setSpecial(sp.value)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      formData.assignees[0] === sp.value
                        ? 'bg-brand-blue text-gray-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>

              {/* A fixed height, so the list scrolls inside itself instead of
                  growing the dialog as you go down it. */}
              <div className={`h-44 overflow-y-auto rounded-lg border divide-y ${
                showErrors && assigneeMissing ? 'border-red-400' : 'border-gray-200'
              }`}>
                {people.map(n => (
                  <label
                    key={n}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={formData.assignees.includes(n)}
                      onChange={() => togglePerson(n)}
                      className="accent-brand-blue-dark"
                    />
                    <span className={memberNames.includes(n) ? '' : 'text-gray-400 italic'}>
                      {n}{memberNames.includes(n) ? '' : ' (former)'}
                    </span>
                  </label>
                ))}
                {people.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">No members on the roster yet.</p>
                )}
              </div>

              {chosenPeople.length > 1 && (
                <p className="text-xs text-gray-400 mt-1">
                  {chosenPeople.length} people share this task — it lands in all of their lists.
                </p>
              )}
              {showErrors && assigneeMissing && <p className="text-red-500 text-sm mt-1">Pick someone, or a side of the team</p>}
            </div>
            {task && (
              <div className="col-span-2 -mb-2">
                <p className="text-xs text-gray-400">
                  Assigned by{' '}
                  {task.assignedBy
                    ? <span className="font-medium text-gray-600">{task.assignedBy}</span>
                    : <span className="italic">unknown — recorded automatically on new tasks</span>}
                </p>
              </div>
            )}
            <div>
              {/* Who to go to when you're stuck on this task — mentors/coaches only. */}
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mentor <span className="text-xs font-normal text-gray-400">(who to ask for help — optional)</span>
              </label>
              <select
                value={formData.mentor}
                onChange={(e) => setFormData({ ...formData, mentor: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              >
                <option value="">Nobody in particular</option>
                {mentorNames.map(n => <option key={n} value={n}>{n}</option>)}
                {formData.mentor && !mentorNames.includes(formData.mentor) && (
                  <option value={formData.mentor}>{formData.mentor} (former)</option>
                )}
              </select>
              {mentorNames.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No mentors yet — add the Mentor or Coach role in User Management.</p>
              )}

            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date *
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent ${
                  showErrors && dueDateMissing ? 'border-red-400' : ''
                }`}
              />
              {showErrors && dueDateMissing && <p className="text-red-500 text-sm mt-1">Set a due date</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              >
                <option value="todo">To Do</option>
                <option value="25">25%</option>
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Required Skills
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map(skill => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    formData.skills.includes(skill)
                      ? 'bg-brand-yellow text-gray-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={descriptionMissing}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium ${
                descriptionMissing
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-brand-yellow hover:bg-brand-yellow-dark'
              }`}
            >
              {task ? 'Save Changes' : requestMode ? 'Send Request' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TaskModal
