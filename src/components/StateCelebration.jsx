import { Star, Trophy, Medal } from 'lucide-react'

export default function StateCelebration() {
  return (
    <div className="relative bg-gradient-to-r from-yellow-300/90 via-brand-yellow/90 to-brand-blue/90 text-gray-800 shadow-lg z-20 overflow-hidden">
      <div className="flex items-center justify-center gap-3 px-4 py-2.5">
        <Trophy size={20} className="text-yellow-700 flex-shrink-0" />
        <Medal size={18} className="text-yellow-600 flex-shrink-0 animate-bounce" />
        <Star size={16} className="text-yellow-500 flex-shrink-0 animate-pulse" />
        <span className="font-bold text-sm md:text-base text-center">
          GOOD JOB AT STATE!
        </span>
        <Star size={16} className="text-yellow-500 flex-shrink-0 animate-pulse" />
        <Medal size={18} className="text-yellow-600 flex-shrink-0 animate-bounce" />
        <Trophy size={20} className="text-yellow-700 flex-shrink-0" />
      </div>
    </div>
  )
}
