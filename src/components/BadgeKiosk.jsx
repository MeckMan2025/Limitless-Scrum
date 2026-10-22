import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import BadgeScanInput from './BadgeScanInput'

// The laptop at the door. A lead signs in, opens this, and walks away; people
// scan their badges as they arrive. The scan box keeps hold of focus so the
// scanner's keystrokes always land in it.
export default function BadgeKiosk({ onExit, onScanned }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-end">
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={14} /> Exit kiosk
          </button>
        </div>
        <div className="text-center">
          <p className="text-5xl font-bold text-gray-800 tabular-nums">
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="text-lg text-gray-500 mt-1">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-400 mt-4">Scan your badge to check in</p>
        </div>
        <BadgeScanInput sticky large onScanned={onScanned} />
      </div>
    </div>
  )
}
