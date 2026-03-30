import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function ProgressionPanel({ athleteId, config, onConfigChange, color = '#6366f1', readOnly = false }) {
  const [data, setData] = useState({ tonnage: [], series: [], byExo: {} })
  const [exercices, setExercices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [localConfig, setLocalConfig] = useState(config)

  useEffect(() => { fetchData() }, [athleteId, config.fav_exercices, config.muscles_filter])
  useEffect(() => { setLocalConfig(config) }, [config])

  async function fetchData() {
    setLoading(true)
    // Fetch all in parallel for performance
    const [blocsRes] = await Promise.all([
      supabase.from('blocs').select('id').eq('athlete_id', athleteId)
    ])
    if (!blocsRes.data?.length) { setLoading(false); return }
    const blocIds = blocsRes.data.map(b => b.id)

    const [semRes, exRes] = await Promise.all([
      supabase.from('semaines').select('id, numero').in('bloc_id', blocIds).order('numero').limit(16),
      supabase.from('exercices').select('id, nom, muscle').neq('nom', '')
    ])

    const semaines = semRes.data || []
    const allExs = exRes.data || []
    const uniqueNoms = [...new Set(allExs.map(e => e.nom))].sort()
    setExercices(uniqueNoms)

    if (!semaines.length) { setLoading(false); return }

    const semIds = semaines.map(s => s.id)
    const scRes = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
    const scancesIds = (scRes.data || []).map(s => s.id)
    if (!scancesIds.length) { setLoading(false); return }

    const exsRes = await supabase.from('exercices').select('id, nom, muscle, unilateral, seance_id')
      .in('seance_id', scancesIds)
    const exsAll = exsRes.data || []

    const srRes = await supabase.from('series_realisees').select('exercice_id, charge, reps, semaine_id')
      .eq('athlete_id', athleteId).in('semaine_id', semIds)
      .not('charge', 'is', null).not('reps', 'is', null)
    const srAll = srRes.data || []

    // Aggregate by semaine
    const tonnageByWeek = []
    const seriesByWeek = []
    const byExo = {}

    for (const sem of semaines) {
      const semLabel = `S${sem.numero}`
      const scInSem = (scRes.data || []).filter(sc => sc.semaine_id === sem.id).map(sc => sc.id)
      const exsInSem = exsAll.filter(e => scInSem.includes(e.seance_id))
      const srInSem = srAll.filter(s => s.semaine_id === sem.id)

      let tonnage = 0; let nbSeries = 0
      for (const sr of srInSem) {
        const ex = exsInSem.find(e => e.id === sr.exercice_id)
        if (!ex) continue
        // Filtre muscles
        if (config.muscles_filter?.length && !config.muscles_filter.includes(ex.muscle)) continue
        const mult = ex.unilateral ? 2 : 1
        tonnage += Number(sr.charge) * Number(sr.reps) * mult
        nbSeries++

        // Par exercice favori
        if (config.fav_exercices?.includes(ex.nom)) {
          if (!byExo[ex.nom]) byExo[ex.nom] = []
          const existing = byExo[ex.nom].find(d => d.semaine === semLabel)
          const t = Number(sr.charge) * Number(sr.reps) * mult
          if (existing) { existing.tonnage += t; existing.series++ }
          else byExo[ex.nom].push({ semaine: semLabel, tonnage: Math.round(t), series: 1 })
        }
      }
      if (tonnage > 0 || nbSeries > 0) {
        tonnageByWeek.push({ semaine: semLabel, tonnage: Math.round(tonnage) })
        seriesByWeek.push({ semaine: semLabel, series: nbSeries })
      }
    }
    setData({ tonnage: tonnageByWeek, series: seriesByWeek, byExo })
    setLoading(false)
  }

  function saveConfig() {
    onConfigChange(localConfig)
    setShowConfig(false)
  }

  const metric = localConfig.metric || 'tonnage'
  const display = localConfig.display || 'graph'
  const mainData = metric === 'series' ? data.series : data.tonnage
  const dataKey = metric === 'series' ? 'series' : 'tonnage'
  const unit = metric === 'series' ? ' séries' : ' kg'

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Progression</p>
        {!readOnly && (
          <button onClick={() => setShowConfig(true)} className="text-xs text-gray-400 hover:text-brand-600 transition-colors">
            Configurer
          </button>
        )}
      </div>

      {showConfig && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-4">Configurer la progression</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">Métrique</label>
                <div className="flex gap-2">
                  {[['tonnage','Tonnage'],['series','Nb séries'],['both','Les deux']].map(([v,l]) => (
                    <button key={v} onClick={() => setLocalConfig(c => ({ ...c, metric: v }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${localConfig.metric === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">Affichage</label>
                <div className="flex gap-2">
                  {[['graph','Graphique'],['table','Tableau']].map(([v,l]) => (
                    <button key={v} onClick={() => setLocalConfig(c => ({ ...c, display: v }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${localConfig.display === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">
                  Exercices favoris (max 5) — graphe individuel
                </label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {exercices.map(nom => {
                    const sel = (localConfig.fav_exercices || []).includes(nom)
                    return (
                      <label key={nom} className="flex items-center gap-2 cursor-pointer py-1">
                        <input type="checkbox" checked={sel}
                          onChange={() => {
                            setLocalConfig(c => {
                              const favs = c.fav_exercices || []
                              if (sel) return { ...c, fav_exercices: favs.filter(f => f !== nom) }
                              if (favs.length >= 5) return c
                              return { ...c, fav_exercices: [...favs, nom] }
                            })
                          }}
                          className="rounded" />
                        <span className="text-sm text-gray-700">{nom}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={saveConfig} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium">Enregistrer</button>
              <button onClick={() => setShowConfig(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 space-y-5">
        {loading ? <p className="text-xs text-gray-400">Chargement...</p> : mainData.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Aucune donnée disponible</p>
        ) : (
          <>
            {/* Graphe/tableau principal */}
            {(metric === 'tonnage' || metric === 'both') && (
              <ProgressChart data={data.tonnage} dataKey="tonnage" label="Tonnage (kg)" color={color} display={display} />
            )}
            {(metric === 'series' || metric === 'both') && (
              <ProgressChart data={data.series} dataKey="series" label="Nb séries" color={color} display={display} />
            )}

            {/* Exercices favoris */}
            {(localConfig.fav_exercices || []).map(nom => (
              data.byExo[nom]?.length > 0 && (
                <div key={nom}>
                  <p className="text-xs font-medium text-gray-600 mb-2">{nom}</p>
                  {(metric === 'tonnage' || metric === 'both') && (
                    <ProgressChart data={data.byExo[nom]} dataKey="tonnage" label="Tonnage" color={color} display={display} compact />
                  )}
                  {(metric === 'series' || metric === 'both') && (
                    <ProgressChart data={data.byExo[nom]} dataKey="series" label="Séries" color={color} display={display} compact />
                  )}
                </div>
              )
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function ProgressChart({ data, dataKey, label, color, display, compact }) {
  if (display === 'table') {
    return (
      <div className="overflow-x-auto">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              {data.map(d => <th key={d.semaine} className="px-2 py-1 text-gray-400 font-medium text-center">{d.semaine}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {data.map(d => <td key={d.semaine} className="px-2 py-1 text-center font-medium text-gray-700">{d[dataKey]?.toLocaleString('fr')}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div>
      {!compact && <p className="text-xs text-gray-400 mb-2">{label}</p>}
      <ResponsiveContainer width="100%" height={compact ? 100 : 140}>
        <BarChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [v?.toLocaleString('fr'), label]} />
          <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
