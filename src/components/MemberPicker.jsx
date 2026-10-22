import { X } from 'lucide-react'
import { useMemberNames } from '../hooks/useMemberNames'

// Pick teammates from the roster instead of typing names — chips plus a
// dropdown of whoever isn't already picked.
// forEvent leaves out mentors, coaches and the shared ETS account — people
// who are at the event but never on its rota. exclude is names taken
// elsewhere (another role, say), so one person is not offered twice.
export default function MemberPicker({ value = [], onChange, placeholder = '+ Add member…', forEvent = false, exclude = [] }) {
  const names = useMemberNames({ forEvent })
  const remaining = names.filter(n => !value.includes(n) && !exclude.includes(n))

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {value.map(name => (
            <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-brand-blue/20 text-gray-600 rounded-full">
              {name}
              <button type="button" onClick={() => onChange(value.filter(v => v !== name))} className="hover:text-red-400">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        onChange={e => e.target.value && onChange([...value, e.target.value])}
        className="w-full text-sm border rounded-lg px-2 py-1 bg-white text-gray-500 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
      >
        <option value="">{placeholder}</option>
        {remaining.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )
}
