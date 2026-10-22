// Shared bits for the log forms, so Outreach and Expenses look like one thing.

// At module scope on purpose. A component declared inside a render body is a
// brand new type on every keystroke, so React throws the input away and
// remounts it — the cursor jumps out of the field mid-word.
export const Field = ({ label, required, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label} {required && <span className="text-brand-yellow-dark">*</span>}
    </label>
    {children}
  </div>
)

export const inputClass =
  'w-full border-b border-gray-200 pb-1.5 text-sm focus:outline-none focus:border-brand-blue-dark transition-colors bg-transparent'

// Local calendar date. toISOString() is UTC, so an evening entry logged after
// ~7pm Central would default to tomorrow.
export const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const prettyDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
