// ============================================================
// PATCH pour CoachBlocEditor.jsx — Feature 4
// Ajouter une vue "Powerlifting multi-semaines" permettant
// d'éditer les exercices principaux (main_lift) sur toutes
// les semaines depuis une seule interface.
// 
// Ce patch concerne la fonction CoachBlocEditor et ajoute :
// 1. Un state `showPlView` (boolean) pour basculer vers la vue multi-sem
// 2. Un composant PowerliftingMultiSemaineView
// ============================================================

// Insérer dans les imports existants de CoachBlocEditor.jsx (pas de nouvel import nécessaire)

// ──────────────────────────────────────────────────────────
// NOUVEAU COMPOSANT à ajouter à la fin du fichier
// ──────────────────────────────────────────────────────────

export function PowerliftingMultiSemaineView({ blocId, semaines, onClose }) {
  // exercices principaux par semaine : { semaineId: { squat: ex, bench: ex, deadlift: ex } }
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})

  useEffect(() => { fetchData() }, [blocId])

  async function fetchData() {
    setLoading(true)
    const semIds = semaines.map(s => s.id)
    const { data: scAll } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
    const scIds = (scAll || []).map(s => s.id)
    const { data: exAll } = await supabase.from('exercices')
      .select('*').in('seance_id', scIds).not('main_lift', 'is', null)

    // Construire la map semaine → { lift → exercice }
    const scToSemaine = {}
    ;(scAll || []).forEach(sc => { scToSemaine[sc.id] = sc.semaine_id })

    const map = {}
    semaines.forEach(s => { map[s.id] = {} })
    ;(exAll || []).forEach(ex => {
      const semId = scToSemaine[ex.seance_id]
      if (semId && ex.main_lift) {
        if (!map[semId]) map[semId] = {}
        // Garder seulement le premier exercice de chaque lift par semaine
        if (!map[semId][ex.main_lift]) map[semId][ex.main_lift] = ex
      }
    })
    setData(map)
    setLoading(false)
  }

  async function updateField(exId, semId, liftKey, field, value) {
    const key = `${exId}-${field}`
    setSaving(p => ({ ...p, [key]: true }))
    await supabase.from('exercices').update({ [field]: value || null }).eq('id', exId)
    setData(prev => ({
      ...prev,
      [semId]: {
        ...prev[semId],
        [liftKey]: { ...prev[semId][liftKey], [field]: value }
      }
    }))
    setSaving(p => ({ ...p, [key]: false }))
    setSaved(p => ({ ...p, [key]: true }))
    setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 1500)
  }

  const LIFTS = ['squat', 'bench', 'deadlift']
  const LIFT_EMOJIS = { squat: '🏋️', bench: '💪', deadlift: '⚡' }
  const LIFT_COLORS = {
    squat:    'border-amber-200 bg-amber-50 text-amber-700',
    bench:    'border-brand-200 bg-brand-50 text-brand-700',
    deadlift: 'border-green-200 bg-green-50 text-green-700',
  }

  const inputCls = "w-full border border-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 bg-gray-50 focus:bg-white"

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl mt-4 mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold">Vue Powerlifting — toutes les semaines</h2>
            <p className="text-xs text-gray-400 mt-0.5">Édite les exercices principaux (squat, bench, deadlift) en une seule vue</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-16">Lift</th>
                  {semaines.map(s => (
                    <th key={s.id} className="px-3 py-3 text-xs font-medium text-gray-500 text-center min-w-[160px]">
                      S{s.numero}
                      {s.date_debut && (
                        <span className="ml-1 text-gray-300 font-normal">
                          {new Date(s.date_debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LIFTS.map(lift => (
                  <tr key={lift} className="border-b border-gray-50">
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2 py-1 rounded-lg border font-medium ${LIFT_COLORS[lift]}`}>
                        {LIFT_EMOJIS[lift]} {lift}
                      </span>
                    </td>
                    {semaines.map(s => {
                      const ex = data[s.id]?.[lift]
                      if (!ex) return (
                        <td key={s.id} className="px-3 py-4">
                          <p className="text-xs text-gray-300 text-center italic">—</p>
                        </td>
                      )
                      return (
                        <td key={s.id} className="px-3 py-4">
                          <div className="space-y-2">
                            {/* Sets × Reps */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number" min={1} max={10}
                                defaultValue={ex.sets}
                                onBlur={e => updateField(ex.id, s.id, lift, 'sets', e.target.value)}
                                className={inputCls + ' w-14 text-center'}
                                title="Sets"
                              />
                              <span className="text-gray-400 text-xs">×</span>
                              <input
                                defaultValue={ex.rep_range}
                                onBlur={e => updateField(ex.id, s.id, lift, 'rep_range', e.target.value)}
                                className={inputCls + ' flex-1'}
                                placeholder="3-5"
                                title="Plage de reps"
                              />
                            </div>
                            {/* Charge indicative */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                defaultValue={ex.charge_indicative || ''}
                                onBlur={e => updateField(ex.id, s.id, lift, 'charge_indicative', e.target.value)}
                                className={inputCls + ' flex-1'}
                                placeholder="kg indic."
                                title="Charge indicative"
                              />
                              <span className="text-xs text-gray-400">kg</span>
                            </div>
                            {/* RPE cible */}
                            <div className="flex items-center gap-1">
                              <input
                                defaultValue={ex.rpe_cible || ''}
                                onBlur={e => updateField(ex.id, s.id, lift, 'rpe_cible', e.target.value)}
                                className={inputCls + ' flex-1'}
                                placeholder="@RPE"
                                title="RPE cible"
                              />
                            </div>
                            {/* Indications */}
                            <textarea
                              defaultValue={ex.indications || ''}
                              onBlur={e => updateField(ex.id, s.id, lift, 'indications', e.target.value)}
                              rows={2}
                              className="w-full border border-gray-100 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-amber-50/30 resize-none placeholder-gray-300"
                              placeholder="Note coach…"
                            />
                            {/* Indicateur de sauvegarde */}
                            {Object.entries(saved).some(([k, v]) => v && k.startsWith(ex.id)) && (
                              <p className="text-xs text-green-500">✓</p>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            Les modifications sont enregistrées immédiatement. La charge indicative et le RPE cible ne se propagent pas automatiquement.
          </p>
        </div>
      </div>
    </div>
  )
}
