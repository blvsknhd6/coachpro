import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { calcSerieTonnage } from '../../lib/tonnage'

const BLOC_PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#06b6d4','#f97316']

export default function ProgressionPanel({ athleteId, config, onConfigChange, color = '#6366f1', readOnly = false }) {
  const [blocs, setBlocs]             = useState([])
  const [activeBlocId, setActiveBlocId] = useState(null)
  const [compareMode, setCompareMode] = useState(false)

  const [data, setData]               = useState({ tonnage: [], series: [], byExo: {} })
  const [compareData, setCompareData] = useState([])
  const [exercices, setExercices]     = useState([])

  const [loadingBlocs, setLoadingBlocs]     = useState(true)
  const [loading, setLoading]               = useState(false)
  const [loadingCompare, setLoadingCompare] = useState(false)
  const [showConfig, setShowConfig]         = useState(false)
  const [localConfig, setLocalConfig]       = useState(config)

  useEffect(() => { if (athleteId) loadBlocs() }, [athleteId])
  useEffect(() => { setLocalConfig(config) }, [config])

  useEffect(() => {
    if (!activeBlocId || compareMode) return
    fetchBlocData(activeBlocId)
  }, [activeBlocId, compareMode, config.fav_exercices, config.muscles_filter])

  useEffect(() => {
    if (compareMode && blocs.length) fetchCompareData()
  }, [compareMode, blocs.length])

  async function loadBlocs() {
    setLoadingBlocs(true)
    const { data: blocsRes } = await supabase
      .from('blocs').select('id, name, created_at')
      .eq('athlete_id', athleteId).order('created_at', { ascending: false })
    setBlocs(blocsRes || [])
    setActiveBlocId(blocsRes?.length ? blocsRes[0].id : null)

    const { data: exRes } = await supabase.from('exercices').select('id, nom, muscle').neq('nom', '')
    const uniqueNoms = [...new Set((exRes || []).map(e => e.nom))].sort()
    setExercices(uniqueNoms)
    setLoadingBlocs(false)
  }

  async function fetchBlocData(blocId) {
    setLoading(true)
    setData({ tonnage: [], series: [], byExo: {} })

    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').eq('bloc_id', blocId).order('numero').limit(16)
    if (!semaines?.length) { setLoading(false); return }

    const semIds = semaines.map(s => s.id)
    const { data: scData } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
    const scIds = (scData || []).map(s => s.id)
    if (!scIds.length) { setLoading(false); return }

    const { data: exsAll } = await supabase.from('exercices')
      .select('id, nom, muscle, unilateral, seance_id, poids_corps')
      .in('seance_id', scIds)

    const [{ data: srAll }, poidsRes] = await Promise.all([
      supabase.from('series_realisees')
        .select('exercice_id, charge, reps, semaine_id, poids_corps_kg')
        .eq('athlete_id', athleteId)
        .in('semaine_id', semIds)
        .not('reps', 'is', null),
      supabase.from('data_tracking').select('poids')
        .eq('athlete_id', athleteId).not('poids', 'is', null)
        .order('date', { ascending: false }).limit(1),
    ])

    const athletePoids = poidsRes.data?.[0]?.poids || null

    const tonnageByWeek = []
    const seriesByWeek  = []
    const byExo         = {}

    for (const sem of semaines) {
      const semLabel  = `S${sem.numero}`
      const scInSem   = (scData || []).filter(sc => sc.semaine_id === sem.id).map(sc => sc.id)
      const exsInSem  = (exsAll || []).filter(e => scInSem.includes(e.seance_id))
      const srInSem   = (srAll  || []).filter(s => s.semaine_id === sem.id)

      let tonnage = 0; let nbSeries = 0
      for (const sr of srInSem) {
        const ex = exsInSem.find(e => e.id === sr.exercice_id)
        if (!ex) continue
        if (config.muscles_filter?.length && !config.muscles_filter.includes(ex.muscle)) continue

        const t = calcSerieTonnage(sr, ex, athletePoids)
        tonnage += t
        nbSeries++

        if (config.fav_exercices?.includes(ex.nom)) {
          if (!byExo[ex.nom]) byExo[ex.nom] = []
          const existing = byExo[ex.nom].find(d => d.semaine === semLabel)
          if (existing) { existing.tonnage += Math.round(t); existing.series++ }
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

  async function fetchCompareData() {
    setLoadingCompare(true)
    const result = []

    await Promise.all(blocs.map(async (bloc) => {
      const { data: semaines } = await supabase
        .from('semaines').select('id, numero').eq('bloc_id', bloc.id).order('numero')
      if (!semaines?.length) return
      const semIds = semaines.map(s => s.id)
      const { data: scAll } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
      const scIds = (scAll || []).map(s => s.id); if (!scIds.length) return

      const [{ data: exAll }, { data: srAll }, poidsRes] = await Promise.all([
        supabase.from('exercices').select('id, seance_id, unilateral, poids_corps').in('seance_id', scIds),
        supabase.from('series_realisees')
          .select('charge, reps, exercice_id, semaine_id, poids_corps_kg')
          .eq('athlete_id', athleteId).in('semaine_id', semIds)
          .not('reps', 'is', null),
        supabase.from('data_tracking').select('poids')
          .eq('athlete_id', athleteId).not('poids', 'is', null)
          .order('date', { ascending: false }).limit(1),
      ])

      const athletePoids = poidsRes.data?.[0]?.poids || null
      const scToSemaine = {}; (scAll || []).forEach(sc => { scToSemaine[sc.id] = sc.semaine_id })
      const exById = {}; (exAll || []).forEach(ex => {
        exById[ex.id] = { unilateral: ex.unilateral, poids_corps: ex.poids_corps }
      })

      const tonnageMap = {}
      ;(srAll || []).forEach(s => {
        const ex = exById[s.exercice_id]; if (!ex) return
        const vol = calcSerieTonnage(s, ex, athletePoids)
        if (!tonnageMap[s.semaine_id]) tonnageMap[s.semaine_id] = { tonnage: 0, series: 0 }
        tonnageMap[s.semaine_id].tonnage += vol
        tonnageMap[s.semaine_id].series++
      })

      semaines.filter(s => tonnageMap[s.id]).forEach(s => {
        result.push({
          semaine:  `S${s.numero}`,
          blocId:   bloc.id,
          blocName: bloc.name,
          tonnage:  Math.round(tonnageMap[s.id].tonnage),
          series:   tonnageMap[s.id].series,
        })
      })
    }))

    setCompareData(result)
    setLoadingCompare(false)
  }

  function saveConfig() { onConfigChange(localConfig); setShowConfig(false) }

  const metric     = localConfig.metric  || 'tonnage'
  const display    = localConfig.display || 'graph'
  const mainData   = metric === 'series' ? data.series : data.tonnage
  const activeBloc = blocs.find(b => b.id === activeBlocId)

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium text-gray-700">Progression</p>
        <div className="flex items-center gap-2 flex-wrap">
          {!compareMode && blocs.length > 0 && (
            <select
              value={activeBlocId || ''}
              onChange={e => setActiveBlocId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white">
              {blocs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {blocs.length > 1 && (
            <button onClick={() => setCompareMode(v => !v)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${compareMode ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              ⇄ Comparer les blocs
            </button>
          )}
          {!readOnly && (
            <button onClick={() => setShowConfig(true)} className="text-xs text-gray-400 hover:text-brand-600 transition-colors">
              Configurer
            </button>
          )}
        </div>
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
                  Exercices favoris (max 5)
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
                          }} className="rounded" />
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
        {loadingBlocs ? (
          <p className="text-xs text-gray-400">Chargement...</p>
        ) : blocs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Aucun bloc pour l'instant</p>
        ) : compareMode ? (
          loadingCompare ? <p className="text-xs text-gray-400">Chargement...</p>
          : compareData.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Aucune donnée disponible</p>
          : (
            <div>
              <p className="text-xs text-gray-400 mb-2">
                {metric === 'series' ? 'Nombre de séries' : 'Tonnage (kg)'} par semaine, par bloc
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="semaine" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={42} />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [v?.toLocaleString('fr')]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {blocs.map((bloc, i) => {
                    const d = compareData.filter(r => r.blocId === bloc.id)
                    if (!d.length) return null
                    return (
                      <Line key={bloc.id} data={d} type="monotone"
                        dataKey={metric === 'series' ? 'series' : 'tonnage'}
                        stroke={BLOC_PALETTE[i % BLOC_PALETTE.length]}
                        strokeWidth={2} dot={{ r: 3 }} connectNulls name={bloc.name} />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        ) : loading ? (
          <p className="text-xs text-gray-400">Chargement...</p>
        ) : mainData.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Aucune donnée disponible{activeBloc ? ` pour ${activeBloc.name}` : ''}
          </p>
        ) : (
          <>
            {(metric === 'tonnage' || metric === 'both') && (
              <ProgressChart data={data.tonnage} dataKey="tonnage" label="Tonnage (kg)" color={color} display={display} />
            )}
            {(metric === 'series' || metric === 'both') && (
              <ProgressChart data={data.series} dataKey="series" label="Nb séries" color={color} display={display} />
            )}
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