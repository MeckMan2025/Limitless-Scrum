import { useState } from 'react'
import { Plus } from 'lucide-react'

// A quiet "+ Add …" pill that turns into an input when clicked — replaces the
// always-visible "type here, press Enter" fields that made boards feel busy.
// Enter adds (and stays open for the next one); Escape or blur-empty closes.
export default function AddInline({ label, placeholder, onAdd }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Plus size={12} /> {label}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && value.trim()) { onAdd(value); setValue('') }
        if (e.key === 'Escape') { setValue(''); setOpen(false) }
      }}
      onBlur={() => { if (value.trim()) onAdd(value); setValue(''); setOpen(false) }}
      placeholder={placeholder || label}
      className="mt-2 w-full text-sm border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
    />
  )
}
