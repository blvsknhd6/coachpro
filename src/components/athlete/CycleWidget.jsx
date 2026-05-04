// src/components/athlete/CycleWidget.jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { fetchPeriodLogs } from '../../lib/cycleService'
import { getCycleStatus } from '../../lib/cycleUtils'

const COLOR_MAP = {
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    bar: 'bg-red-400'    },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', bar: 'bg-yellow-400' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  bar: 'bg-green-500'  },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-400' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: 'bg-purple-400' },
}

export default function CycleWidget() {
  const { profile } = useAuth()
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    fetchPeriodLogs(profile.id).then(({ data }) => {
      setStatus(getCycleStatus(data))
      setLoading(false)
    })
  }, [profile?.id])

  if (loading) return <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />

  const c = status ? COLOR_MAP[status.phaseColor] || COLOR_MAP.purple : null

  if (!status) {
    return (
      <div className="bg-white border border-dashed border-pink-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Suivi du cycle 🌸</p>
          <p className="text-xs text-gray-400 mt-0.5">Suis ton cycle pour des conseils adaptés</p>
        </div>
        <Link to="/athlete/cycle"
          className="text-xs bg-pink-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-pink-700 flex-shrink-0">
          Commencer →
        </Link>
      </div>
    )
  }

  const progressPct = Math.min(100, Math.round(((status.dayInCycle - 1) / status.avgCycleLength) * 100))

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-4`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={`text-sm font-semibold ${c.text}`}>{status.phaseLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">{status.dayLabel}</p>
        </div>
        <Link to="/athlete/cycle" className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2">
          Détails →
        </Link>
      </div>

      <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-3">
        <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${progressPct}%` }} />
      </div>

      <p className="text-xs text-gray-600 italic mb-1.5">{status.message}</p>
      <p className="text-xs text-gray-500">{status.trainingAdvice}</p>

      {status.daysUntilNextPeriod >= 0 && status.daysUntilNextPeriod <= 30 && (
        <p className="text-xs text-gray-400 mt-2">
          Prochaines règles estimées : {new Date(status.predictedNextPeriodDate + 'T12:00:00')
            .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        </p>
      )}

      {status.isLowData && (
        <p className="text-xs text-amber-500 mt-1.5">⚠️ Moins de 3 entrées — estimation approximative</p>
      )}
      {status.isIrregular && (
        <p className="text-xs text-amber-500 mt-1">⚠️ Cycle irrégulier (±{status.cycleVariability}j)</p>
      )}
    </div>
  )
}