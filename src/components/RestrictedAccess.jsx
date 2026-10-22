import { ShieldX } from 'lucide-react'

export default function RestrictedAccess({ feature }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-w-0 gap-4 p-8">
      <ShieldX size={56} className="text-gray-300" />
      <h2 className="text-xl font-bold text-gray-500">Restricted Access</h2>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        {feature
          ? `You don't have permission to access ${feature}.`
          : "You don't have permission to access this feature."}
      </p>
      <p className="text-xs text-gray-300 text-center">
        Contact a team lead if you believe this is an error.
      </p>
    </div>
  )
}
