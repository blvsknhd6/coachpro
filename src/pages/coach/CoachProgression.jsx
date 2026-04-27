import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

const BLOC_PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#06b6d4','#f97316']

export default function CoachProgression() {
  const { profile } = useAuth()
  const theme = useTheme()
  const { prefs, updateProgression } = usePreferences()
  const color = theme.isFemme ? '#ec4899' : '#6366f1'

  // ── Blocs ──────────────────────────────────────────────────────────
  const [blocs, setBlocs]           = useState([])
  const [activeBloc, setActiveBloc] = useState(null)

  // ── Données du bloc actif ──────────────────────────────────────────
  const [allExercices, setAllExercices]               = useState([])
  const [allMuscles, setAllMuscles]                   = useState([])
  const [tonnageData, setTonnageData]                 = useState([])
  const [volumeData, setVolumeData]                   = useState([])
  const [favData, setFavData]                         = useState({})

  // ── Historique cross-blocs ─────────────────────────────────────────
  const [historiqueData, setHistoriqueData]         = useState([])
  const [historiqueFavData, setHistoriqueFavData]   = useState({})

  const [loading, setLoading]             = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showConfig, setShowConfig]       = useState(false)

  const config        = prefs?.progression_config || {}
  const mode          = config.mode          || 'graphe'
  const metric        = config.metric        || 'tonnage'
  const favExos       = config.fav_exercices || []
  const musclesExclus = config.muscles_exclus || []

  // ── Init ───────────────────────────────────────────────────────────
  useEffect(() => { if (profile) loadBlocs() }, [profile])

  useEffect(() => {
    if (!activeBloc) return
    loadBlocData(activeBloc.id)
  }, [activeBloc?.id, JSON.stringify(musclesExclus)])

  useEffect(() => {
    if (favExos.length && allExercices.length) loadFavData(favExos, activeBloc?.id)
    else if (!favExos.length) setFavData({})
  }, [JSON.stringify(favExos), allExercices.length])

  useEffect(() => {
    if (blocs.length > 1) loadHistorique()
  }, [blocs.length, JSON.stringify(favExos)])

  // ── Chargement blocs ───────────────────────────────────────────────
  async function loadBlocs() {
    const { data } = await supabase
      .from('blocs').select('id, name, created_at')
      .eq('athlete_id', profile.id).order('created_at', { ascending: false })
    setBlocs(data || [])
    if (data?.length) setActiveBloc(data[0])
    else setLoading(false)
  }

  // ── Données du bloc actif ─────────────────────────────────────────
  async function loadBlocData(blocId) {
    setLoading(true)
    setAllExercices([]); setTonnageData([]); setVolumeData([]); setFavData({})

    const { data: semainesBloc } = await supabase
      .from('semaines').select('id').eq('bloc_id', blocId)
    if (!semainesBloc?.length) { setLoading(false); return }

    const semIds = semainesBloc.map(s => s.id)
    const { data: scBloc } = await supabase.from('seances').select('id').in('semaine_id', semIds)
    if (!scBloc?.length) { setLoading(false); return }

    const scIds = scBloc.map(s => s.id)
    const { data: exs } = await supabase
      .from('exercices').select('id, nom, muscle').in('seance_id', scIds)

    const unique = [], seen = new Set(), muscles = new Set()
    ;(exs || []).forEach(e => {
      if (!seen.has(e.nom)) { seen.add(e.nom); unique.push(e) }
      if (e.muscle) muscles.add(e.muscle)
    })
    setAllExercices(unique.sort((a, b) => a.nom.localeCompare(b.nom)))
    setAllMuscles([...muscles].sort())

    await loadTonnageAndVolume(blocId)
    if (favExos.length) await loadFavData(favExos, blocId)
    setLoading(false)
  }

  async function loadTonnageAndVolume(blocId) {
    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').eq('bloc_id', blocId).order('numero')
    if (!semaines?.length) return

    const semIds = semaines.map(s => s.id)
    const { data: scAll } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
    const scIds = (scAll || []).map(s => s.id); if (!scIds.length) return

    const [{ data: exAll }, { data: srAll }] = await Promise.all([
      supabase.from('exercices').select('id, muscle, seance_id, unilateral').in('seance_id', scIds),
      supabase.from('series_realisees')
        .select('charge, reps, exercice_id, semaine_id')
        .eq('athlete_id', profile.id).in('semaine_id', semIds)
        .not('charge', 'is', null).not('reps', 'is', null),
    ])

    const scToSemaine = {}
    ;(scAll || []).forEach(sc => { scToSemaine[sc.id] = sc.semaine_id })
    const exById = {}
    ;(exAll || []).forEach(ex => {
      exById[ex.id] = { muscle: ex.muscle || 'autre', semaine_id: scToSemaine[ex.seance_id], unilateral: ex.unilateral }
    })

    const tonnageMap = {}, muscleVolMap = {}
    ;(srAll || []).forEach(s => {
      const ex = exById[s.exercice_id]; if (!ex) return
      const { muscle, unilateral } = ex
      if (musclesExclus.includes(muscle)) return
      const vol   = Number(s.charge) * Number(s.reps) * (unilateral ? 2 : 1)
      const semId = s.semaine_id
      if (!tonnageMap[semId]) tonnageMap[semId] = { tonnage: 0, series: 0 }
      tonnageMap[semId].tonnage += vol; tonnageMap[semId].series++
      muscleVolMap[muscle] = (muscleVolMap[muscle] || 0) + vol
    })

    setTonnageData(semaines.filter(s => tonnageMap[s.id]).map(s => ({
      semaine: `S${s.numero}`,
      tonnage: Math.round(tonnageMap[s.id].tonnage),
      series:  tonnageMap[s.id].series,
    })))
    setVolumeData(
      Object.entries(muscleVolMap)
        .map(([m, v]) => ({ muscle: m, volume: Math.round(v) }))
        .sort((a, b) => b.volume - a.volume).slice(0, 8)
    )
  }

  async function loadFavData(exoNoms, blocId) {
    if (!exoNoms.length || !blocId) return
    const { data: semainesBloc } = await supabase.from('semaines').select('id').eq('bloc_id', blocId)
    if (!semainesBloc?.length) return
    const semIds = semainesBloc.map(s => s.id)

    const { data: exs } = await supabase
      .from('exercices').select('id, nom, seance_id').in('nom', exoNoms)
    if (!exs?.length) return
    const scIds = [...new Set(exs.map(e => e.seance_id))]

    const [{ data: seances }, { data: srAll }] = await Promise.all([
      supabase.from('seances').select('id, semaine_id').in('id', scIds).in('semaine_id', semIds),
      supabase.from('series_realisees')
        .select('charge, reps, exercice_id, semaine_id')
        .eq('athlete_id', profile.id).in('exercice_id', exs.map(e => e.id)).in('semaine_id', semIds)
        .not('charge', 'is', null),
    ])

    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').in('id', semIds).order('numero')

    const seanceToSemaine = {}; (seances || []).forEach(sc => { seanceToSemaine[sc.id] = sc.semaine_id })
    const exToNom = {}; const exToSemaine = {}
    ;(exs || []).forEach(ex => {
      exToNom[ex.id] = ex.nom
      const sid = seanceToSemaine[ex.seance_id]; if (sid) exToSemaine[ex.id] = sid
    })
    const semaineNumero = {}; (semaines || []).forEach(s => { semaineNumero[s.id] = s.numero })

    const aggr = {}
    ;(srAll || []).forEach(s => {
      const nom = exToNom[s.exercice_id]; const semId = exToSemaine[s.exercice_id]
      if (!nom || !semId) return
      if (!aggr[nom]) aggr[nom] = {}
      if (!aggr[nom][semId]) aggr[nom][semId] = { maxCharge: 0, series: 0, tonnage: 0 }
      const d = aggr[nom][semId]
      d.maxCharge = Math.max(d.maxCharge, Number(s.charge)); d.series++
      d.tonnage += Number(s.charge) * (Number(s.reps) || 0)
    })

    const result = {}
    for (const nom of exoNoms) {
      if (!aggr[nom]) { result[nom] = []; continue }
      result[nom] = Object.entries(aggr[nom])
        .sort((a, b) => (semaineNumero[a[0]] || 0) - (semaineNumero[b[0]] || 0))
        .map(([semId, d]) => ({
          semaine: `S${semaineNumero[semId]}`, charge: d.maxCharge,
          series:  d.series, tonnage: Math.round(d.tonnage),
        }))
    }
    setFavData(result)
  }

  // ── Historique cross-blocs ─────────────────────────────────────────
  async function loadHistorique() {
    if (blocs.length <= 1) return
    setLoadingHistory(true)

    const result = []
    await Promise.all(blocs.map(async (bloc, blocIdx) => {
      const { data: semaines } = await supabase
        .from('semaines').select('id, numero').eq('bloc_id', bloc.id).order('numero')
      if (!semaines?.length) return
      const semIds = semaines.map(s => s.id)
      const { data: scAll } = await supabase.from('seances').select('id, semaine_id').in('semaine_id', semIds)
      const scIds = (scAll || []).map(s => s.id); if (!scIds.length) return
      const { data: exAll } = await supabase.from('exercices').select('id, seance_id, unilateral').in('seance_id', scIds)
      const { data: srAll } = await supabase.from('series_realisees')
        .select('charge, reps, exercice_id, semaine_id')
        .eq('athlete_id', profile.id).in('semaine_id', semIds)
        .not('charge', 'is', null).not('reps', 'is', null)

      const scToSemaine = {}; (scAll || []).forEach(sc => { scToSemaine[sc.id] = sc.semaine_id })
      const exById = {}; (exAll || []).forEach(ex => {
        exById[ex.id] = { semaine_id: scToSemaine[ex.seance_id], unilateral: ex.unilateral }
      })
      const tonnageMap = {}
      ;(srAll || []).forEach(s => {
        const ex = exById[s.exercice_id]; if (!ex) return
        const vol = Number(s.charge) * Number(s.reps) * (ex.unilateral ? 2 : 1)
        if (!tonnageMap[s.semaine_id]) tonnageMap[s.semaine_id] = { tonnage: 0, series: 0 }
        tonnageMap[s.semaine_id].tonnage += vol; tonnageMap[s.semaine_id].series++
      })
      semaines.filter(s => tonnageMap[s.id]).forEach(s => {
        result.push({
          semaine:  `S${s.numero}`, blocName: bloc.name, blocIdx,
          tonnage:  Math.round(tonnageMap[s.id].tonnage),
          series:   tonnageMap[s.id].series,
        })
      })
    }))
    setHistoriqueData(result)

    // Cross-blocs pour les favoris
    if (favExos.length) {
      const favResult = {}
      await Promise.all(blocs.map(async (bloc, blocIdx) => {
        const { data: semainesBloc } = await supabase
          .from('semaines').select('id, numero').eq('bloc_id', bloc.id).order('numero')
        if (!semainesBloc?.length) return
        const semIds = semainesBloc.map(s => s.id)
        const { data: exs } = await supabase
          .from('exercices').select('id, nom, seance_id').in('nom', favExos)
        if (!exs?.length) return
        const scIds = [...new Set(exs.map(e => e.seance_id))]
        const [{ data: seances }, { data: srAll }] = await Promise.all([
          supabase.from('seances').select('id, semaine_id').in('id', scIds).in('semaine_id', semIds),
          supabase.from('series_realisees')
            .select('charge, reps, exercice_id, semaine_id')
            .eq('athlete_id', profile.id).in('exercice_id', exs.map(e => e.id)).in('semaine_id', semIds)
            .not('charge', 'is', null),
        ])
        const seanceToSemaine = {}; (seances || []).forEach(sc => { seanceToSemaine[sc.id] = sc.semaine_id })
        const exToNom = {}; const exToSemaine = {}
        ;(exs || []).forEach(ex => {
          exToNom[ex.id] = ex.nom
          const sid = seanceToSemaine[ex.seance_id]; if (sid) exToSemaine[ex.id] = sid
        })
        const semaineNumero = {}; (semainesBloc || []).forEach(s => { semaineNumero[s.id] = s.numero })
        ;(srAll || []).forEach(s => {
          const nom = exToNom[s.exercice_id]; const semId = exToSemaine[s.exercice_id]
          if (!nom || !semId) return
          if (!favResult[nom]) favResult[nom] = []
          const key = `${bloc.name} S${semaineNumero[semId]}`
          const existing = favResult[nom].find(d => d.semaine === key)
          const charge = Number(s.charge)
          if (existing) { existing.charge = Math.max(existing.charge, charge) }
          else favResult[nom].push({ semaine: key, charge, blocIdx, blocName: bloc.name })
        })
      }))
      setHistoriqueFavData(favResult)
    }

    setLoadingHistory(false)
  }

  // ── Composants graphes ─────────────────────────────────────────────
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
              {dataKeys.map(k => (
                <td key={k.key} className="py-1.5 text-right text-gray-600">
                  {row[k.key] ? row[k.key].toLocaleString('fr') : '—'}
                </td>
              ))}
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

      {/* Sélecteur de bloc */}
      {blocs.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {blocs.map((b, i) => (
            <button key={b.id} onClick={() => setActiveBloc(b)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                activeBloc?.id === b.id
                  ? 'text-white border-transparent'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
              style={activeBloc?.id === b.id ? { backgroundColor: BLOC_PALETTE[i % BLOC_PALETTE.length] } : {}}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Config */}
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
            <p className="text-xs font-medium text-gray-500 mb-2">Métrique</p>
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

          {/* Exercices favoris — bloc actif */}
          {favExos.length > 0 && favExos.map(exoNom => {
            const data = favData[exoNom] || []
            return (
              <div key={exoNom} className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">{exoNom}</p>
                <p className="text-xs text-gray-400 mb-3">{activeBloc?.name}</p>
                {!favData[exoNom] ? (
                  <div className="h-36 bg-gray-50 rounded-lg animate-pulse" />
                ) : data.length === 0 ? (
                  <p className="text-xs text-gray-400">Pas encore de données sur ce bloc</p>
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

          {/* Volume total — bloc actif */}
          {tonnageData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Volume total — {activeBloc?.name}</p>
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

          {/* Volume par muscle — bloc actif */}
          {volumeData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Volume par groupe musculaire — {activeBloc?.name}</p>
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
                  <DataTable
                    data={volumeData.map(v => ({ semaine: v.muscle, tonnage: v.volume }))}
                    dataKeys={[{ key: 'tonnage', label: 'Volume total' }]}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── HISTORIQUE CROSS-BLOCS ── */}
          {blocs.length > 1 && (
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Historique tous blocs</p>

              {loadingHistory ? (
                <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <>
                  {historiqueData.length > 0 && (
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                      <p className="text-sm font-medium text-gray-700 mb-3">Volume comparatif — tous blocs</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="semaine" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={42} />
                          <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [v?.toLocaleString('fr') + ' kg']} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                          {blocs.map((bloc, i) => {
                            const d = historiqueData.filter(r => r.blocName === bloc.name)
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
                  )}

                  {favExos.length > 0 && Object.keys(historiqueFavData).length > 0 && favExos.map(exoNom => {
                    const d = historiqueFavData[exoNom] || []
                    if (!d.length) return null
                    return (
                      <div key={`hist-${exoNom}`} className="bg-white border border-gray-100 rounded-xl p-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">{exoNom} — charge max historique</p>
                        <p className="text-xs text-gray-400 mb-3">Tous blocs confondus</p>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={d} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="semaine" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={40} />
                            <YAxis tick={{ fontSize: 10 }} width={35} />
                            <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`${v}kg`, 'Charge max']} />
                            <Line type="monotone" dataKey="charge" stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls name="Charge max" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
