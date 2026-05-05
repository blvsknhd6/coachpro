import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import { fetchPeriodLogs, upsertPeriodLog, deletePeriodLog } from '../../lib/cycleService'
import { getCycleStatus, PHASE_CONFIG } from '../../lib/cycleUtils'

const PHASE_COLOR_CLASSES = {
  red:    'bg-red-100 text-red-700 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  green:  'bg-green-100 text-green-700 border-green-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
}

export default function CycleTrackerPage() {
  const { profile } = useAuth()
  const [logs, setLogs]         = useState([])
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ period_start_date: '', period_duration_days: '' })
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { if (profile) load() }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await fetchPeriodLogs(profile.id)
    setLogs(data)
    setStatus(getCycleStatus(data))
    setLoading(false)
  }

  async function handleSave() {
    if (!form.period_start_date) return
    setSaving(true)
    await upsertPeriodLog(profile.id, {
      period_start_date:    form.period_start_date,
      period_duration_days: form.period_duration_days ? Number(form.period_duration_days) : null,
    })
    setForm({ period_start_date: '', period_duration_days: '' })
    setShowForm(false)
    setSaving(false)
    await load()
  }

  async function handleDelete(id) {
    await deletePeriodLog(id)
    setDeleteId(null)
    await load()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-5">
        <Link to="/athlete" className="text-sm text-gray-400 hover:text-gray-700">← Accueil</Link>
        <h1 className="text-xl font-semibold flex-1">Mon cycle 🌸</h1>
        {logs.length < 10 && (
          <button onClick={() => setShowForm(v => !v)}
            className="bg-pink-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-pink-700">
            + Ajouter
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white border border-pink-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Nouvelle entrée</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Début des règles</label>
              <input type="date" value={form.period_start_date} max={today}
                onChange={e => setForm(f => ({ ...f, period_start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Durée (jours, optionnel)</label>
              <input type="number" min={1} max={15} value={form.period_duration_days}
                onChange={e => setForm(f => ({ ...f, period_duration_days: e.target.value }))}
                placeholder="5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving || !form.period_start_date}
              className="flex-1 bg-pink-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-pink-700 disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">

          {status ? (
            <StatusCard status={status} />
          ) : (
            <div className="bg-pink-50 border border-pink-200 rounded-xl p-5 text-center">
              <p className="text-sm text-pink-700 font-medium mb-1">Aucune donnée</p>
              <p className="text-xs text-pink-500">Ajoute la date de tes dernières règles pour commencer le suivi.</p>
            </div>
          )}

          {logs.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Historique</p>
                <p className="text-xs text-gray-400">{logs.length}/10 entrées</p>
              </div>
              <div className="divide-y divide-gray-50">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center justify-between px-5 py-3">
                    {deleteId === log.id ? (
                      <>
                        <p className="text-xs text-gray-500">Supprimer cette entrée ?</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleDelete(log.id)} className="text-xs text-red-500 font-medium">Oui</button>
                          <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400">Non</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm text-gray-800">
                            {new Date(log.period_start_date + 'T12:00:00').toLocaleDateString('fr-FR', {
                              weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
                            })}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {log.period_duration_days ? `${log.period_duration_days} jours` : 'durée non renseignée'}
                          </p>
                        </div>
                        <button onClick={() => setDeleteId(log.id)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {status && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-sm font-medium text-gray-700 mb-3">Statistiques</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Durée moy. cycle</p>
                  <p className="font-medium text-gray-800">{status.avgCycleLength} jours</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Durée moy. règles</p>
                  <p className="font-medium text-gray-800">{status.avgPeriodDuration} jours</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Variabilité</p>
                  <p className={`font-medium ${status.isIrregular ? 'text-amber-600' : 'text-green-600'}`}>
                    ±{status.cycleVariability} jours {status.isIrregular ? '⚠️' : '✓'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Prochaines règles</p>
                  <p className="font-medium text-gray-800">
                    {new Date(status.predictedNextPeriodDate + 'T12:00:00')
                      .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Les phases du cycle</p>
            <div className="space-y-2">
              {Object.entries(PHASE_CONFIG).map(([key, cfg]) => (
                <div key={key}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${
                    status?.currentPhase === key
                      ? PHASE_COLOR_CLASSES[cfg.color]
                      : 'bg-gray-50 border-gray-100 text-gray-600'
                  }`}>
                  <div className="flex-1">
                    <p className="font-medium">{cfg.label}</p>
                    <p className="mt-0.5 opacity-80">{cfg.trainingAdvice}</p>
                  </div>
                  {status?.currentPhase === key && (
                    <span className="flex-shrink-0 font-semibold text-xs">← maintenant</span>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </Layout>
  )
}

function StatusCard({ status }) {
  const colorMap = {
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    bar: 'bg-red-400'    },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', bar: 'bg-yellow-400' },
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  bar: 'bg-green-500'  },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-400' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: 'bg-purple-400' },
  }
  const c = colorMap[status.phaseColor] || colorMap.purple
  const progressPct = Math.min(100, Math.round(((status.dayInCycle - 1) / status.avgCycleLength) * 100))

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-5`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className={`text-base font-bold ${c.text}`}>{status.phaseLabel}</p>
          <p className="text-sm text-gray-600 mt-0.5">{status.dayLabel}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${PHASE_COLOR_CLASSES[status.phaseColor]}`}>
          J{status.dayInCycle}/{status.avgCycleLength}
        </span>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Début règles</span>
          <span>{progressPct}%</span>
          <span>Prochaines règles</span>
        </div>
        <div className="h-2.5 bg-white/70 rounded-full overflow-hidden">
          <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <p className="text-sm italic text-gray-700 mb-2">{status.message}</p>
      <div className={`text-xs px-3 py-2 rounded-lg bg-white/60 ${c.text} font-medium`}>
        🏋️ {status.trainingAdvice}
      </div>

      {status.daysUntilNextPeriod >= 0 && (
        <p className="text-xs text-gray-500 mt-3">
          📅 Prochaines règles estimées le{' '}
          <strong>
            {new Date(status.predictedNextPeriodDate + 'T12:00:00')
              .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </strong>
          {status.daysUntilNextPeriod === 0
            ? ' (aujourd\'hui)'
            : ` — dans ${status.daysUntilNextPeriod} jour${status.daysUntilNextPeriod > 1 ? 's' : ''}`}
        </p>
      )}

      {(status.isLowData || status.isIrregular) && (
        <div className="mt-3 space-y-1">
          {status.isLowData   && <p className="text-xs text-amber-600">⚠️ Moins de 3 cycles enregistrés — estimation approximative</p>}
          {status.isIrregular && <p className="text-xs text-amber-600">⚠️ Cycle irrégulier détecté (variation ±{status.cycleVariability}j)</p>}
        </div>
      )}
    </div>
  )
}