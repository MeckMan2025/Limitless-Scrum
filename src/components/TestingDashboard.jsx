import { ArrowLeft, FlaskConical } from 'lucide-react'

// NOTE: This is a temporary placeholder. The real TestingDashboard was built on
// another computer and never pushed to GitHub, so it wasn't in the repo. This stub
// lets the app run. If you pull the real file later, it will replace this one.
export default function TestingDashboard({ onBack }) {
  return (
    <div className="flex-1 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center space-y-3">
          <FlaskConical size={40} className="mx-auto text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-700">Testing Dashboard</h2>
          <p className="text-sm text-gray-500">
            This is a temporary placeholder. The full Testing Dashboard hasn&apos;t been
            added to this copy of the project yet.
          </p>
        </div>
      </div>
    </div>
  )
}
