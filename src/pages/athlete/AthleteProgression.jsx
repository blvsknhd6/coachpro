import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

function epley1RM(weight, reps, rpe = null) {
  if (!weight || !reps || Number(reps) <= 0) return null
  const rir = rpe != null ? Math.max(0, 10 - Number(rpe)) : 0
  const adjReps = Number(reps) + rir
  return Math.round(Number(weight) * (1 + adjReps / 30) * 10) / 10
}

const LIFT_COLORS   = { squat: '#f59e0b', bench: '#6366f1', deadlift: '#10b981', total: '#ef4444' }
const LIFT_LABELS   = { squat: '🏋️ Squat', bench: '💪 Bench', deadlift: '⚡ Deadlift', total: '∑ Total' }
const MUSCLE_COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']

export default function AthleteProgression() {
  const { profile } = useAuth()
  const theme = useTheme()
  const { prefs, updateProgression } = usePreferences()
  const color = theme.isFemme ? '#ec4899' : '#6366f1'

  const [allExercices, setAllExercices]                 = useState([])
  const [allMuscles, setAllMuscles]                     = useState([])
  const [tonnageData, setTonnageData]                   = useState([])
  const [volumeParSemaineData, setVolumeParSemaineData] = useState([])
  const [volumeMuscles, setVolumeMuscles]               = useState([])
  const [oneRMData, setOneRMData]                       = useState([])
  const [hasMainLifts, setHasMainLifts]                 = useState(false)
  const [favData, setFavData]                           = useState({})
  const [loading, setLoading]                           = useState(true)
  const [showConfig, setShowConfig]                     = useState(false)

  const config        = prefs?.progression_config || {}
  const mode          = config.mode || 'graphe'
  const metric        = config.metric || 'tonnage'
  const favExos       = config.fav_exercices || []
  const musclesExclus = config.muscles_exclus || []

  useEffect(() => { if (profile) loadInitialData() }, [profile])
  useEffect(() => {
    if (favExos.length && allExercices.length) loadFavData(favExos)
    else if (!favExos.length) setFavData({})
  }, [JSON.stringify(favExos), allExercices.length])

  async function loadInitialData() {
    setLoading(true)
    const { data: sr } = await supabase.from('series_realisees').select('exercice_id').eq('athlete_id', profile.id)
    if (!sr?.length) { setLoading(false); return }

    const ids = [...new Set(sr.map(s => s.exercice_id))]
    const { data: exs } = await supabase.from('exercices').select('id, nom, muscle, main_lift').in('id', ids)
    const unique = [], seen = new Set(), muscles = new Set()
    ;(exs || []).forEach(e => {
      if (!seen.has(e.nom)) { seen.add(e.nom); unique.push(e) }
      if (e.muscle) muscles.add(e.muscle)
    })
    setAllExercices(unique.sort((a, b) => a.nom.localeCompare(b.nom)))
    setAllMuscles([...muscles].sort())

    const hasLifts = (exs || []).some(e => e.main_lift)
    setHasMainLifts(hasLifts)

    await Promise.all([
      loadTonnageAndVolume(),
      hasLifts ? load1RMData() : Promise.resolve(),
    ])
    setLoading(false)
  }

  async function loadFavData(exoNoms) {
    if (!exoNoms.length) return

    const { data: exs } = await supabase
      .from('exercices').select('id, nom, seance_id').in('nom', exoNoms)
    if (!exs?.length) return

    const scIds = [...new Set(exs.map(e => e.seance_id))]

    const [{ data: seances }, { data: srAll }] = await Promise.all([
      supabase.from('seances').select('id, semaine_id').in('id', scIds),
      supabase.from('series_realisees')
        .select('charge, reps, exercice_id, semaine_id')
        .eq('athlete_id', profile.id)
        .in('exercice_id', exs.map(e => e.id))
        .not('charge', 'is', null),
    ])

    const semaineIds = [...new Set((seances || []).map(s => s.semaine_id))]
    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').in('id', semaineIds).order('numero')

    const seanceToSemaine = {}
    ;(seances || []).forEach(sc => { seanceToSemaine[sc.id] = sc.semaine_id })

    const exToNom = {}
    const exToSemaine = {}
    ;(exs || []).forEach(ex => {
      exToNom[ex.id] = ex.nom
      const semId = seanceToSemaine[ex.seance_id]
      if (semId) exToSemaine[ex.id] = semId
    })

    const semaineNumero = {}
    ;(semaines || []).forEach(s => { semaineNumero[s.id] = s.numero })

    const aggr = {}
    ;(srAll || []).forEach(s => {
      const nom = exToNom[s.exercice_id]
      const semId = exToSemaine[s.exercice_id]
      if (!nom || !semId) return
      if (!aggr[nom]) aggr[nom] = {}
      if (!aggr[nom][semId]) aggr[nom][semId] = { maxCharge: 0, series: 0, tonnage: 0 }
      const d = aggr[nom][semId]
      d.maxCharge = Math.max(d.maxCharge, Number(s.charge))
      d.series++
      d.tonnage += Number(s.charge) * (Number(s.reps) || 0)
    })

    const result = {}
    for (const nom of exoNoms) {
      if (!aggr[nom]) { result[nom] = []; continue }
      result[nom] = Object.entries(aggr[nom])
        .sort((a, b) => (semaineNumero[a[0]] || 0) - (semaineNumero[b[0]] || 0))
        .map(([semId, d]) => ({
          semaine: `S${semaineNumero[semId]}`,
          charge:  d.maxCharge,
          series:  d.series,
          tonnage: Math.round(d.tonnage),
        }))
    }
    setFavData(result)
  }

  async function loadTonnageAndVolume() {
    const { data: blocs } = await supabase.from('blocs').select('id').eq('athlete_id', profile.id)
    if (!blocs?.length) return

    const { data: semaines } = await supabase.from('semaines')
      .select('id, numero').in('bloc_id', blocs.map(b => b.id)).order('numero').limit(16)
    if (!semaines?.length) return

    const semIds = semaines.map(s => s.id)
    const { data: scAll } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
    const scIds = (scAll || []).map(s => s.id)
    if (!scIds.length) return

    const [{ data: exAll }, { data: srAll }] = await Promise.all([
      supabase.from('exercices').select('id, muscle, seance_id, unilateral').in('seance_id', scIds),
      supabase.from('series_realisees')
        .select('charge, reps, exercice_id, semaine_id')
        .eq('athlete_id', profile.id)
        .in('semaine_id', semIds)
        .not('charge', 'is', null).not('reps', 'is', null),
    ])

    const scToSemaine = {}
    ;(scAll || []).forEach(sc => { scToSemaine[sc.id] = sc.semaine_id })
    const exById = {}
    ;(exAll || []).forEach(ex => {
      exById[ex.id] = { muscle: ex.muscle || 'autre', semaine_id: scToSemaine[ex.seance_id], unilateral: ex.unilateral }
    })

    const tonnageMap = {}, muscleVolTotal = {}, muscleVolBySem = {}
    ;(srAll || []).forEach(s => {
      const ex = exById[s.exercice_id]; if (!ex) return
      const { muscle, unilateral } = ex
      if (musclesExclus.includes(muscle)) return
      const vol = Number(s.charge) * Number(s.reps) * (unilateral ? 2 : 1)
      const semId = s.semaine_id
      if (!tonnageMap[semId]) tonnageMap[semId] = { tonnage: 0, series: 0 }
      tonnageMap[semId].tonnage += vol; tonnageMap[semId].series++
      muscleVolTotal[muscle] = (muscleVolTotal[muscle] || 0) + vol
      if (!muscleVolBySem[semId]) muscleVolBySem[semId] = {}
      muscleVolBySem[semId][muscle] = (muscleVolBySem[semId][muscle] || 0) + vol
    })

    setTonnageData(semaines.filter(s => tonnageMap[s.id]).map(s => ({
      semaine: `S${s.numero}`, tonnage: Math.round(tonnageMap[s.id].tonnage), series: tonnageMap[s.id].series,
    })))

    const topMuscles = Object.entries(muscleVolTotal).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m]) => m)
    setVolumeMuscles(topMuscles)
    setVolumeParSemaineData(semaines.filter(s => muscleVolBySem[s.id]).map(s => {
      const row = { semaine: `S${s.numero}` }
      let hasData = false
      topMuscles.forEach(m => { row[m] = Math.round(muscleVolBySem[s.id]?.[m] || 0); if (row[m] > 0) hasData = true })
      return hasData ? row : null
    }).filter(Boolean))
  }

  async function load1RMData() {
    const { data: blocs } = await supabase.from('blocs').select('id').eq('athlete_id', profile.id)
    if (!blocs?.length) return
    const { data: semaines } = await supabase.from('semaines')
      .select('id, numero').in('bloc_id', blocs.map(b => b.id)).order('numero').limit(16)
    if (!semaines?.length) return
    const semIds = semaines.map(s => s.id)
    const { data: scAll } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
    const scIds = (scAll || []).map(s => s.id); if (!scIds.length) return
    const { data: exAll } = await supabase.from('exercices')
      .select('id, main_lift, seance_id').in('seance_id', scIds).not('main_lift', 'is', null)
    if (!exAll?.length) return
    const exIds = exAll.map(e => e.id)
    const { data: srAll } = await supabase.from('series_realisees')
      .select('charge, reps, rpe, exercice_id, semaine_id')
      .eq('athlete_id', profile.id).in('semaine_id', semIds).in('exercice_id', exIds)
      .not('charge', 'is', null).not('reps', 'is', null)
    const exById = {}; (exAll || []).forEach(ex => { exById[ex.id] = ex })
    const rows = semaines.map(sem => {
      const srInSem = (srAll || []).filter(s => s.semaine_id === sem.id); if (!srInSem.length) return null
      const best = { squat: null, bench: null, deadlift: null }
      for (const s of srInSem) {
        const ex = exById[s.exercice_id]; if (!ex?.main_lift) continue
        const est = epley1RM(s.charge, s.reps, s.rpe)
        if (est && (best[ex.main_lift] === null || est > best[ex.main_lift])) best[ex.main_lift] = est
      }
      const total = (best.squat || 0) + (best.bench || 0) + (best.deadlift || 0)
      if (!Object.values(best).some(v => v !== null)) return null
      return { semaine: `S${sem.numero}`, ...best, total: total > 0 ? total : null }
    }).filter(Boolean)
    setOneRMData(rows)
  }

  const DataChart = ({ data, dataKey, name, color: c }) => (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey={dataKey} stroke={c} strokeWidth={2} dot={{ r: 3 }} name={name} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )

  const DataBar = ({ data, dataKey, name }) => (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} name={name} />
      </BarChart>
    </ResponsiveContainer>
  )

  const DataTable = ({ data, dataKeys }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 text-gray-400 font-medium">Semaine</th>
            {dataKeys.map(k => <th key={k.key} className="text-right py-2 text-gray-400 font-medium">{k.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-1.5 text-gray-700 font-medium">{row.semaine}</td>
              {dataKeys.map(k => <td key={k.key} className="py-1.5 text-right text-gray-600">{row[k.key] != null ? row[k.key].toLocaleString('fr') : '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">Ma progression</h1>
        <button onClick={() => setShowConfig(v => !v)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5">
          {showConfig ? 'Fermer config' : 'Configurer'}
        </button>
      </div>

      {showConfig && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Affichage</p>
            <div className="flex gap-2">
              {[['graphe','Graphe'],['tableau','Tableau'],['les_deux','Les deux']].map(([v,l]) => (
                <button key={v} onClick={() => updateProgression({ mode: v })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Métrique volume</p>
            <div className="flex gap-2">
              {[['tonnage','Tonnage'],['series','Nb séries'],['les_deux','Les deux']].map(([v,l]) => (
                <button key={v} onClick={() => updateProgression({ metric: v })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${metric === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Exercices favoris (1-5)</p>
            <div className="flex flex-wrap gap-1.5">
              {allExercices.map(ex => {
                const isFav    = favExos.includes(ex.nom)
                const disabled = !isFav && favExos.length >= 5
                return (
                  <button key={ex.id} disabled={disabled}
                    onClick={() => updateProgression({ fav_exercices: isFav ? favExos.filter(e => e !== ex.nom) : [...favExos, ex.nom] })}
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${isFav ? 'bg-brand-600 text-white border-brand-600' : disabled ? 'border-gray-100 text-gray-300' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {ex.nom}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Exclure groupes musculaires</p>
            <div className="flex flex-wrap gap-1.5">
              {allMuscles.map(m => {
                const exclu = musclesExclus.includes(m)
                return (
                  <button key={m} onClick={() => updateProgression({ muscles_exclus: exclu ? musclesExclus.filter(x => x !== m) : [...musclesExclus, m] })}
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${exclu ? 'bg-red-100 text-red-600 border-red-200' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {exclu ? '- ' : ''}{m}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : allExercices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">Commence à remplir tes séances pour voir ta progression.</p>
      ) : (
        <div className="space-y-4">

          {/* 1RM estimés — powerlifting uniquement */}
          {hasMainLifts && oneRMData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">1RM estimés par semaine</p>
              <p className="text-xs text-gray-400 mb-3">Formule Epley · ajusté par RPE si renseigné</p>
              {(mode === 'graphe' || mode === 'les_deux') && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={oneRMData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={42} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v, name) => [`${v}kg`, LIFT_LABELS[name] || name]} />
                    <Legend formatter={name => LIFT_LABELS[name] || name} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    {oneRMData.some(d => d.squat)     && <Line type="monotone" dataKey="squat"    stroke={LIFT_COLORS.squat}    strokeWidth={2} dot={{ r: 3 }} connectNulls name="squat" />}
                    {oneRMData.some(d => d.bench)     && <Line type="monotone" dataKey="bench"    stroke={LIFT_COLORS.bench}    strokeWidth={2} dot={{ r: 3 }} connectNulls name="bench" />}
                    {oneRMData.some(d => d.deadlift)  && <Line type="monotone" dataKey="deadlift" stroke={LIFT_COLORS.deadlift} strokeWidth={2} dot={{ r: 3 }} connectNulls name="deadlift" />}
                    {oneRMData.some(d => d.total > 0) && <Line type="monotone" dataKey="total"    stroke={LIFT_COLORS.total}    strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} connectNulls name="total" />}
                  </LineChart>
                </ResponsiveContainer>
              )}
              {(mode === 'tableau' || mode === 'les_deux') && (
                <div className={mode === 'les_deux' ? 'mt-3' : ''}>
                  <DataTable data={oneRMData} dataKeys={[
                    { key: 'squat',    label: '🏋️ Squat (kg)'    },
                    { key: 'bench',    label: '💪 Bench (kg)'    },
                    { key: 'deadlift', label: '⚡ Deadlift (kg)' },
                    { key: 'total',    label: '∑ Total'          },
                  ]} />
                </div>
              )}
            </div>
          )}

          {/* Exercices favoris */}
          {favExos.length > 0 && favExos.map(exoNom => {
            const data = favData[exoNom] || []
            return (
              <div key={exoNom} className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">{exoNom}</p>
                {!favData[exoNom] ? (
                  <div className="h-36 bg-gray-50 rounded-lg animate-pulse" />
                ) : data.length === 0 ? (
                  <p className="text-xs text-gray-400">Pas encore de données</p>
                ) : (
                  <>
                    {(mode === 'graphe' || mode === 'les_deux') && (
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={35} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          {metric !== 'series'  && <Line type="monotone" dataKey="tonnage" stroke={color}   strokeWidth={2} dot={{ r: 3 }} name="Tonnage" connectNulls />}
                          {metric !== 'tonnage' && <Line type="monotone" dataKey="series"  stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Séries"  connectNulls />}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    {(mode === 'tableau' || mode === 'les_deux') && (
                      <div className={mode === 'les_deux' ? 'mt-3' : ''}>
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-gray-100">
                            <th className="text-left py-1.5 text-gray-400">Sem.</th>
                            <th className="text-right py-1.5 text-gray-400">Charge max</th>
                            {metric !== 'series'  && <th className="text-right py-1.5 text-gray-400">Tonnage</th>}
                            {metric !== 'tonnage' && <th className="text-right py-1.5 text-gray-400">Séries</th>}
                          </tr></thead>
                          <tbody>{data.map((r, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-1.5 text-gray-700">{r.semaine}</td>
                              <td className="py-1.5 text-right text-gray-600">{r.charge}kg</td>
                              {metric !== 'series'  && <td className="py-1.5 text-right text-gray-600">{r.tonnage.toLocaleString('fr')}</td>}
                              {metric !== 'tonnage' && <td className="py-1.5 text-right text-gray-600">{r.series}</td>}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {/* Volume total */}
          {tonnageData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Volume total par semaine</p>
              {metric !== 'series' && (
                <>
                  {(mode === 'graphe' || mode === 'les_deux') && <DataBar data={tonnageData} dataKey="tonnage" name="Tonnage (kg)" />}
                  {(mode === 'tableau' || mode === 'les_deux') && <div className={mode === 'les_deux' ? 'mt-3' : ''}><DataTable data={tonnageData} dataKeys={[{ key: 'tonnage', label: 'Tonnage (kg)' }]} /></div>}
                </>
              )}
              {metric !== 'tonnage' && (
                <>
                  {(mode === 'graphe' || mode === 'les_deux') && <div className="mt-3"><DataBar data={tonnageData} dataKey="series" name="Nb séries" /></div>}
                  {(mode === 'tableau' || mode === 'les_deux') && <div className="mt-3"><DataTable data={tonnageData} dataKeys={[{ key: 'series', label: 'Nb séries' }]} /></div>}
                </>
              )}
            </div>
          )}

          {/* Volume par groupe musculaire */}
          {volumeParSemaineData.length > 0 && volumeMuscles.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Volume par groupe musculaire / semaine</p>
              <p className="text-xs text-gray-400 mb-3">Top 6 muscles · tonnage (kg)</p>
              {(mode === 'graphe' || mode === 'les_deux') && (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={volumeParSemaineData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={42} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`${v.toLocaleString('fr')} kg`]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    {volumeMuscles.map((muscle, i) => (
                      <Line key={muscle} type="monotone" dataKey={muscle}
                        stroke={MUSCLE_COLORS[i % MUSCLE_COLORS.length]}
                        strokeWidth={2} dot={{ r: 3 }} connectNulls name={muscle} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
              {(mode === 'tableau' || mode === 'les_deux') && (
                <div className={mode === 'les_deux' ? 'mt-3' : ''}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 text-gray-400 font-medium w-12">Sem.</th>
                          {volumeMuscles.map(m => <th key={m} className="text-right py-2 text-gray-400 font-medium px-1">{m}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {volumeParSemaineData.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-1.5 text-gray-700 font-medium">{row.semaine}</td>
                            {volumeMuscles.map(m => (
                              <td key={m} className="py-1.5 text-right text-gray-600 px-1">
                                {row[m] ? row[m].toLocaleString('fr') : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
