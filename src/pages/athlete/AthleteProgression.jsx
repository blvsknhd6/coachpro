import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function AthleteProgression() {
  const { profile } = useAuth()
  const theme = useTheme()
  const { prefs, updateProgression } = usePreferences()
  const color = theme.isFemme ? '#ec4899' : '#6366f1'

  const [allExercices, setAllExercices] = useState([])
  const [allMuscles, setAllMuscles] = useState([])
  const [chargeData, setChargeData] = useState([])
  const [tonnageData, setTonnageData] = useState([])
  const [volumeData, setVolumeData] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const config = prefs?.progression_config || {}
  const mode = config.mode || 'graphe'
  const metric = config.metric || 'tonnage'
  const favExos = config.fav_exercices || []
  const musclesExclus = config.muscles_exclus || []
  const selectedExo = config.selected_exo || ''

  useEffect(() => { if (profile) loadInitialData() }, [profile])
  useEffect(() => { if (selectedExo && allExercices.length) loadChargeData(selectedExo) }, [selectedExo, allExercices])

  async function loadInitialData() {
    setLoading(true)
    const { data: sr } = await supabase.from('series_realisees').select('exercice_id').eq('athlete_id', profile.id)
    if (!sr?.length) { setLoading(false); return }

    const ids = [...new Set(sr.map(s => s.exercice_id))]
    const { data: exs } = await supabase.from('exercices').select('id, nom, muscle').in('id', ids)
    const unique = [], seen = new Set(), muscles = new Set()
    ;(exs || []).forEach(e => {
      if (!seen.has(e.nom)) { seen.add(e.nom); unique.push(e) }
      if (e.muscle) muscles.add(e.muscle)
    })
    setAllExercices(unique.sort((a, b) => a.nom.localeCompare(b.nom)))
    setAllMuscles([...muscles].sort())

    if (!selectedExo && unique.length) {
      updateProgression({ selected_exo: unique[0].nom })
    }

    await loadTonnageData()
    setLoading(false)
  }

  async function loadChargeData(exoNom) {
    setLoadingChart(true)
    const { data: exs } = await supabase.from('exercices').select('id, seance_id').eq('nom', exoNom)
    if (!exs?.length) { setChargeData([]); setLoadingChart(false); return }
    const { data: seances } = await supabase.from('seances').select('id, semaine_id').in('id', exs.map(e => e.seance_id))
    const semaineIds = [...new Set((seances || []).map(s => s.semaine_id))]
    const { data: semaines } = await supabase.from('semaines').select('id, numero').in('id', semaineIds).order('numero')

    const data = []
    for (const sem of semaines || []) {
      const exsInSem = exs.filter(e => seances?.find(s => s.id === e.seance_id && s.semaine_id === sem.id))
      if (!exsInSem.length) continue
      const { data: sr } = await supabase.from('series_realisees').select('charge, reps, exercice_id')
        .eq('athlete_id', profile.id).in('exercice_id', exsInSem.map(e => e.id)).not('charge', 'is', null)
      if (!sr?.length) continue
      const maxCharge = Math.max(...sr.map(s => Number(s.charge)))
      const totalSeries = sr.length
      const tonnage = sr.reduce((acc, s) => acc + Number(s.charge) * (Number(s.reps) || 0), 0)
      data.push({ semaine: `S${sem.numero}`, charge: maxCharge, series: totalSeries, tonnage: Math.round(tonnage) })
    }
    setChargeData(data)
    setLoadingChart(false)
  }

  async function loadTonnageData() {
    const { data: blocs } = await supabase.from('blocs').select('id').eq('athlete_id', profile.id)
    if (!blocs?.length) return
    const { data: semaines } = await supabase.from('semaines').select('id, numero').in('bloc_id', blocs.map(b => b.id)).order('numero').limit(16)

    const tonnageByWeek = [], volumeByMuscle = {}
    for (const sem of semaines || []) {
      const { data: scIds } = await supabase.from('seances').select('id').eq('semaine_id', sem.id)
      if (!scIds?.length) continue
      const { data: exIds } = await supabase.from('exercices').select('id, muscle').in('seance_id', scIds.map(s => s.id))
      if (!exIds?.length) continue
      const { data: sr } = await supabase.from('series_realisees').select('charge, reps, exercice_id')
        .eq('athlete_id', profile.id).in('exercice_id', exIds.map(e => e.id)).not('charge', 'is', null).not('reps', 'is', null)
      if (!sr?.length) continue
      let tonnage = 0, totalSeries = sr.length
      sr.forEach(s => {
        const t = Number(s.charge) * Number(s.reps)
        tonnage += t
        const muscle = exIds.find(e => e.id === s.exercice_id)?.muscle || 'autre'
        if (!musclesExclus.includes(muscle)) volumeByMuscle[muscle] = (volumeByMuscle[muscle] || 0) + t
      })
      if (tonnage > 0 || totalSeries > 0) tonnageByWeek.push({ semaine: `S${sem.numero}`, tonnage: Math.round(tonnage), series: totalSeries })
    }
    setTonnageData(tonnageByWeek)
    setVolumeData(Object.entries(volumeByMuscle).map(([m, v]) => ({ muscle: m, volume: Math.round(v) })).sort((a, b) => b.volume - a.volume).slice(0, 8))
  }

  function getMetricKey() { return metric === 'tonnage' ? 'tonnage' : metric === 'series' ? 'series' : null }
  function getMetricLabel() { return metric === 'tonnage' ? 'Tonnage (kg)' : metric === 'series' ? 'Nb séries' : '' }

  const DataChart = ({ data, dataKey, name, color: c }) => (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey={dataKey} stroke={c} strokeWidth={2} dot={{ r: 3 }} name={name} />
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
              {dataKeys.map(k => <td key={k.key} className="py-1.5 text-right text-gray-600">{row[k.key] ? row[k.key].toLocaleString('fr') : '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const metricKeys = metric === 'les_deux'
    ? [{ key: 'tonnage', label: 'Tonnage' }, { key: 'series', label: 'Séries' }]
    : [{ key: getMetricKey(), label: getMetricLabel() }]

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">Ma progression</h1>
        <button onClick={() => setShowConfig(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5">
          {showConfig ? 'Fermer config' : 'Configurer'}
        </button>
      </div>

      {/* Configuration */}
      {showConfig && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Affichage</p>
            <div className="flex gap-2">
              {[['graphe','Graphe'],['tableau','Tableau'],['les_deux','Les deux']].map(([v,l]) => (
                <button key={v} onClick={() => updateProgression({ mode: v })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Métrique</p>
            <div className="flex gap-2">
              {[['tonnage','Tonnage'],['series','Nb séries'],['les_deux','Les deux']].map(([v,l]) => (
                <button key={v} onClick={() => updateProgression({ metric: v })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${metric === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Exercices favoris (1-5)</p>
            <div className="flex flex-wrap gap-1.5">
              {allExercices.map(ex => {
                const isFav = favExos.includes(ex.nom)
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
                  <button key={m}
                    onClick={() => updateProgression({ muscles_exclus: exclu ? musclesExclus.filter(x => x !== m) : [...musclesExclus, m] })}
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
          {/* Exercice sélectionné — charge max */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Charge max par semaine</p>
              <select value={selectedExo} onChange={e => updateProgression({ selected_exo: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none max-w-40 truncate">
                {allExercices.map(e => <option key={e.id} value={e.nom}>{e.nom}</option>)}
              </select>
            </div>
            {loadingChart ? <div className="h-40 bg-gray-50 rounded-lg animate-pulse" /> :
              chargeData.length > 0 ? (
                <>
                  {(mode === 'graphe' || mode === 'les_deux') && <DataChart data={chargeData} dataKey="charge" name="Charge max (kg)" color={color} />}
                  {(mode === 'tableau' || mode === 'les_deux') && (
                    <div className={mode === 'les_deux' ? 'mt-3' : ''}>
                      <DataTable data={chargeData} dataKeys={[{ key: 'charge', label: 'Charge max (kg)' }]} />
                    </div>
                  )}
                </>
              ) : <p className="text-xs text-gray-400 text-center py-8">Pas encore de données</p>
            }
          </div>

          {/* Exercices favoris */}
          {favExos.length > 0 && (
            <div className="space-y-3">
              {favExos.map(exoNom => (
                <FavExoCard key={exoNom} exoNom={exoNom} athleteId={profile.id} metric={metric} mode={mode} color={color} />
              ))}
            </div>
          )}

          {/* Volume total par semaine */}
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
              {metric === 'les_deux' && (mode === 'tableau' || mode === 'les_deux') && (
                <div className="mt-3"><DataTable data={tonnageData} dataKeys={[{ key: 'tonnage', label: 'Tonnage' }, { key: 'series', label: 'Séries' }]} /></div>
              )}
            </div>
          )}

          {/* Par groupe musculaire */}
          {volumeData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Volume par groupe musculaire</p>
              {(mode === 'graphe' || mode === 'les_deux') && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={volumeData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="muscle" type="category" tick={{ fontSize: 10 }} width={65} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="volume" fill={color} radius={[0, 3, 3, 0]} name="Volume" />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {(mode === 'tableau' || mode === 'les_deux') && (
                <div className="mt-3">
                  <DataTable data={volumeData.map(v => ({ semaine: v.muscle, tonnage: v.volume }))} dataKeys={[{ key: 'tonnage', label: 'Volume total' }]} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}

function FavExoCard({ exoNom, athleteId, metric, mode, color }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [exoNom])

  async function loadData() {
    setLoading(true)
    const { data: exs } = await supabase.from('exercices').select('id, seance_id').eq('nom', exoNom)
    if (!exs?.length) { setLoading(false); return }
    const { data: seances } = await supabase.from('seances').select('id, semaine_id').in('id', exs.map(e => e.seance_id))
    const semaineIds = [...new Set((seances || []).map(s => s.semaine_id))]
    const { data: semaines } = await supabase.from('semaines').select('id, numero').in('id', semaineIds).order('numero')

    const rows = []
    for (const sem of semaines || []) {
      const exsInSem = exs.filter(e => seances?.find(s => s.id === e.seance_id && s.semaine_id === sem.id))
      if (!exsInSem.length) continue
      const { data: sr } = await supabase.from('series_realisees').select('charge, reps')
        .eq('athlete_id', athleteId).in('exercice_id', exsInSem.map(e => e.id)).not('charge', 'is', null)
      if (!sr?.length) continue
      const maxCharge = Math.max(...sr.map(s => Number(s.charge)))
      const totalSeries = sr.length
      const tonnage = Math.round(sr.reduce((acc, s) => acc + Number(s.charge) * (Number(s.reps) || 0), 0))
      rows.push({ semaine: `S${sem.numero}`, charge: maxCharge, series: totalSeries, tonnage })
    }
    setData(rows)
    setLoading(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-sm font-medium text-gray-700 mb-3">{exoNom}</p>
      {loading ? <div className="h-36 bg-gray-50 rounded-lg animate-pulse" /> : data.length === 0 ? (
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
                {metric !== 'series' && <Line type="monotone" dataKey="tonnage" stroke={color} strokeWidth={2} dot={{ r: 3 }} name="Tonnage" />}
                {metric !== 'tonnage' && <Line type="monotone" dataKey="series" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Séries" />}
              </LineChart>
            </ResponsiveContainer>
          )}
          {(mode === 'tableau' || mode === 'les_deux') && (
            <div className={mode === 'les_deux' ? 'mt-3' : ''}>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-100">
                  <th className="text-left py-1.5 text-gray-400">Sem.</th>
                  <th className="text-right py-1.5 text-gray-400">Charge max</th>
                  {metric !== 'series' && <th className="text-right py-1.5 text-gray-400">Tonnage</th>}
                  {metric !== 'tonnage' && <th className="text-right py-1.5 text-gray-400">Séries</th>}
                </tr></thead>
                <tbody>{data.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-700">{r.semaine}</td>
                    <td className="py-1.5 text-right text-gray-600">{r.charge}kg</td>
                    {metric !== 'series' && <td className="py-1.5 text-right text-gray-600">{r.tonnage.toLocaleString('fr')}</td>}
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
}
