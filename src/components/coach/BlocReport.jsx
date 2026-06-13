import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { calcSerieTonnage } from '../../lib/tonnage'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

const MUSCLE_COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']

// ── Composants graphes légers ─────────────────────────────────────────
function MiniLine({ data, dataKey, color = '#6366f1', height = 120, unit = '' }) {
  if (!data?.length) return <p className="text-xs text-gray-300 text-center py-4">Pas de données</p>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="semaine" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} />
        <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => [`${v}${unit}`]} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

function MiniBar({ data, dataKey, color = '#6366f1', height = 120, unit = '' }) {
  if (!data?.length) return <p className="text-xs text-gray-300 text-center py-4">Pas de données</p>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="semaine" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} />
        <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => [`${typeof v === 'number' ? v.toLocaleString('fr') : v}${unit}`]} />
        <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Section card ──────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 py-4">{children}</div>}
    </div>
  )
}

// ── BlocReport ────────────────────────────────────────────────────────
export default function BlocReport({ athleteId, blocId, blocName, athleteName, onClose }) {
  const [loading, setLoading]           = useState(true)
  const [semaines, setSemaines]         = useState([])
  const [objectifs, setObjectifs]       = useState(null)
  const [trackingBySemaine, setTrackingBySemaine] = useState([])
  const [progressionExos, setProgressionExos]     = useState([])  // charge max par exo par semaine
  const [tonnageParSemaine, setTonnageParSemaine] = useState([])
  const [volumeParMuscle, setVolumeParMuscle]     = useState([])
  const [volumeMuscleSemaine, setVolumeMuscleSemaine] = useState([])
  const [topMuscles, setTopMuscles]     = useState([])
  const [poidsEvolution, setPoidsEvolution] = useState([])
  const [seancesCompletion, setSeancesCompletion] = useState([]) // % completion par semaine
  const [hasMainLifts, setHasMainLifts] = useState(false)
  const [oneRMProgression, setOneRMProgression] = useState([])   // 1RM estimé SBD par semaine

  useEffect(() => { if (athleteId && blocId) fetchAll() }, [athleteId, blocId])

  async function fetchAll() {
    setLoading(true)

    const [{ data: sems }, { data: obj }, poidsRes] = await Promise.all([
      supabase.from('semaines').select('id, numero, date_debut').eq('bloc_id', blocId).order('numero'),
      supabase.from('objectifs_bloc').select('*').eq('bloc_id', blocId).single(),
      supabase.from('data_tracking').select('poids').eq('athlete_id', athleteId)
        .not('poids', 'is', null).order('date', { ascending: false }).limit(1),
    ])

    setSemaines(sems || [])
    setObjectifs(obj)
    const athletePoids = poidsRes.data?.[0]?.poids || null

    if (!sems?.length) { setLoading(false); return }
    const semIds = sems.map(s => s.id)
    const semLabel = (id) => `S${sems.find(s => s.id === id)?.numero || '?'}`

    // ── Tracking journalier ───────────────────────────────────────────
    const { data: tracking } = await supabase.from('data_tracking')
      .select('*').eq('athlete_id', athleteId).eq('bloc_id', blocId).order('date')

    // Regrouper par semaine via date_debut
    const trackingBySem = sems.map(sem => {
      let jours = []
      if (sem.date_debut) {
        const fin = new Date(sem.date_debut + 'T12:00:00')
        fin.setDate(fin.getDate() + 6)
        const finStr = fin.toISOString().split('T')[0]
        jours = (tracking || []).filter(d => d.date >= sem.date_debut && d.date <= finStr)
      }
      const avg = (key) => {
        const srcKey = key === 'pas' ? 'pas_journaliers' : key
        const vals = jours.map(j => j[srcKey]).filter(v => v != null)
        return vals.length ? parseFloat((vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length).toFixed(1)) : null
      }
      return {
        semaine:   `S${sem.numero}`,
        kcal:      avg('kcal'),
        proteines: avg('proteines'),
        glucides:  avg('glucides'),
        lipides:   avg('lipides'),
        sommeil:   avg('sommeil'),
        pas:       avg('pas'),
        stress:    avg('stress'),
        sport:     jours.filter(j => j.sport_fait).length,
        nbJours:   jours.length,
      }
    }).filter(s => s.nbJours > 0)

    setTrackingBySemaine(trackingBySem)

    // Évolution poids
    const poidsData = (tracking || []).filter(d => d.poids).map(d => ({
      date:   d.date,
      poids:  d.poids,
    }))
    setPoidsEvolution(poidsData)

    // ── Exercices et séries ───────────────────────────────────────────
    const { data: scAll } = await supabase.from('seances').select('id, semaine_id, nom').in('semaine_id', semIds)
    const scIds = (scAll || []).map(s => s.id)

    const [{ data: exAll }, { data: srAll }] = await Promise.all([
      supabase.from('exercices').select('id, nom, muscle, seance_id, unilateral, poids_corps, main_lift, sets').in('seance_id', scIds),
      supabase.from('series_realisees')
        .select('exercice_id, semaine_id, charge, reps, rpe, numero_set, poids_corps_kg')
        .eq('athlete_id', athleteId).in('semaine_id', semIds)
        .not('reps', 'is', null),
    ])

    const exById = {}; (exAll || []).forEach(ex => { exById[ex.id] = ex })
    const scToSemaine = {}; (scAll || []).forEach(sc => { scToSemaine[sc.id] = sc.semaine_id })

    // ── Tonnage & volume par semaine ──────────────────────────────────
    const tonnageMap = {}     // semId → tonnage
    const muscleVolMap = {}   // muscle → tonnage total
    const muscleSemMap = {}   // semId → { muscle → tonnage }

    ;(srAll || []).forEach(s => {
      const ex = exById[s.exercice_id]; if (!ex) return
      const vol = calcSerieTonnage(s, ex, athletePoids)
      if (!tonnageMap[s.semaine_id]) tonnageMap[s.semaine_id] = 0
      tonnageMap[s.semaine_id] += vol
      muscleVolMap[ex.muscle] = (muscleVolMap[ex.muscle] || 0) + vol
      if (!muscleSemMap[s.semaine_id]) muscleSemMap[s.semaine_id] = {}
      muscleSemMap[s.semaine_id][ex.muscle] = (muscleSemMap[s.semaine_id][ex.muscle] || 0) + vol
    })

    const tonnageBySem = sems.filter(s => tonnageMap[s.id]).map(s => ({
      semaine: `S${s.numero}`,
      tonnage: Math.round(tonnageMap[s.id]),
    }))
    setTonnageParSemaine(tonnageBySem)

    const topM = Object.entries(muscleVolMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m]) => m)
    setTopMuscles(topM)
    setVolumeParMuscle(
      Object.entries(muscleVolMap).sort((a, b) => b[1] - a[1]).map(([muscle, v]) => ({ muscle, volume: Math.round(v) }))
    )

    const volSemData = sems.filter(s => muscleSemMap[s.id]).map(s => {
      const row = { semaine: `S${s.numero}` }
      topM.forEach(m => { row[m] = Math.round(muscleSemMap[s.id]?.[m] || 0) })
      return row
    })
    setVolumeMuscleSemaine(volSemData)

    // ── Progression charge max par exercice ───────────────────────────
    // Grouper les séries par exercice (nom) → par semaine → max charge
    const exoMaxMap = {}  // nom → { semId → maxCharge, maxReps }
    ;(srAll || []).forEach(s => {
      const ex = exById[s.exercice_id]; if (!ex || !s.charge) return
      if (!exoMaxMap[ex.nom]) exoMaxMap[ex.nom] = { muscle: ex.muscle, bySem: {} }
      const cur = exoMaxMap[ex.nom].bySem[s.semaine_id]
      const charge = Number(s.charge)
      if (!cur || charge > cur.charge) {
        exoMaxMap[ex.nom].bySem[s.semaine_id] = { charge, reps: Number(s.reps) || 0 }
      }
    })

    // Calculer progression S1→Sfin pour chaque exercice
    const progList = Object.entries(exoMaxMap).map(([nom, { muscle, bySem }]) => {
      const semAvecData = sems.filter(s => bySem[s.id])
      if (semAvecData.length < 1) return null
      const first = bySem[semAvecData[0].id]
      const last  = bySem[semAvecData[semAvecData.length - 1].id]
      const delta = last.charge - first.charge
      const deltaPct = first.charge > 0 ? Math.round((delta / first.charge) * 100) : 0
      // Série temporelle pour graphe
      const series = sems.filter(s => bySem[s.id]).map(s => ({
        semaine: `S${s.numero}`,
        charge:  bySem[s.id].charge,
        reps:    bySem[s.id].reps,
      }))
      return { nom, muscle, first: first.charge, last: last.charge, delta, deltaPct, series, nbSem: semAvecData.length }
    }).filter(Boolean).sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))

    setProgressionExos(progList)

    // ── 1RM estimé SBD ────────────────────────────────────────────────
    const mainLiftExs = (exAll || []).filter(e => e.main_lift)
    const hasLifts    = mainLiftExs.length > 0
    setHasMainLifts(hasLifts)

    if (hasLifts) {
      const mainExIds = mainLiftExs.map(e => e.id)
      const srMain    = (srAll || []).filter(s => mainExIds.includes(s.exercice_id) && s.charge && s.reps)

      const oneRMRows = sems.map(sem => {
        const srInSem = srMain.filter(s => s.semaine_id === sem.id)
        if (!srInSem.length) return null
        const best = { squat: null, bench: null, deadlift: null }
        for (const s of srInSem) {
          const ex = exById[s.exercice_id]; if (!ex?.main_lift) continue
          const rir     = s.rpe ? Math.max(0, 10 - Number(s.rpe)) : 0
          const adjReps = Number(s.reps) + rir
          const est     = Math.round(Number(s.charge) * (1 + adjReps / 30) * 10) / 10
          if (!best[ex.main_lift] || est > best[ex.main_lift]) best[ex.main_lift] = est
        }
        const total = (best.squat || 0) + (best.bench || 0) + (best.deadlift || 0)
        if (!Object.values(best).some(v => v)) return null
        return { semaine: `S${sem.numero}`, ...best, total: total || null }
      }).filter(Boolean)
      setOneRMProgression(oneRMRows)
    }

    // ── Complétion des séances par semaine ────────────────────────────
    const completionBySem = sems.map(sem => {
      const scInSem = (scAll || []).filter(sc => sc.semaine_id === sem.id && sc.nom !== 'Bonus')
      const exInSem = (exAll || []).filter(ex => scInSem.map(sc => sc.id).includes(ex.seance_id))
      const totalSets = exInSem.reduce((acc, ex) => acc + (ex.sets || 0), 0)
      const srInSem   = (srAll || []).filter(s => s.semaine_id === sem.id && s.reps)
      const doneSets  = srInSem.length
      return {
        semaine: `S${sem.numero}`,
        pct:     totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0,
        done:    doneSets,
        total:   totalSets,
      }
    })
    setSeancesCompletion(completionBySem)

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Génération du compte rendu…</p>
        </div>
      </div>
    )
  }

  const poidsDepart = objectifs?.poids_cible
    ? null
    : semaines[0]?.date_debut
      ? null : null

  const planLabel = { prise_de_masse: '💪 Prise de masse', maintien: '⚖️ Maintien', seche: '🔥 Sèche' }

  // Stats globales
  const totalTonnage = tonnageParSemaine.reduce((acc, s) => acc + s.tonnage, 0)
  const avgCompletion = seancesCompletion.length
    ? Math.round(seancesCompletion.reduce((a, s) => a + s.pct, 0) / seancesCompletion.length)
    : 0

  // Progression charge : top gainers & top decliners
  const gainers   = progressionExos.filter(e => e.delta > 0).slice(0, 5)
  const decliners = progressionExos.filter(e => e.delta < 0).slice(0, 3)
  const stable    = progressionExos.filter(e => e.delta === 0)

  const avgKcal = trackingBySemaine.length
    ? Math.round(trackingBySemaine.filter(s => s.kcal).reduce((a, s) => a + s.kcal, 0) / trackingBySemaine.filter(s => s.kcal).length)
    : null
  const avgSommeil = trackingBySemaine.length
    ? parseFloat((trackingBySemaine.filter(s => s.sommeil).reduce((a, s) => a + s.sommeil, 0) / trackingBySemaine.filter(s => s.sommeil).length).toFixed(1))
    : null
  const totalSportJours = trackingBySemaine.reduce((a, s) => a + s.sport, 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-50 rounded-2xl w-full max-w-4xl shadow-2xl mt-4 mb-8">

        {/* Header */}
        <div className="bg-white rounded-t-2xl px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Compte rendu de fin de bloc</p>
            <h2 className="text-xl font-bold text-gray-900">{athleteName} — {blocName}</h2>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-gray-500">{semaines.length} semaines</span>
              {objectifs?.plan_nutritionnel && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {planLabel[objectifs.plan_nutritionnel]}
                </span>
              )}
              {semaines[0]?.date_debut && (
                <span className="text-xs text-gray-400">
                  {new Date(semaines[0].date_debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  {semaines[semaines.length - 1]?.date_debut && (
                    <> → {new Date(semaines[semaines.length - 1].date_debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                  )}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none mt-1">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* KPIs globaux */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Tonnage total', value: totalTonnage.toLocaleString('fr'), unit: 'kg', color: 'text-brand-700' },
              { label: 'Complétion moy.', value: `${avgCompletion}`, unit: '%', color: avgCompletion >= 80 ? 'text-green-600' : avgCompletion >= 60 ? 'text-amber-500' : 'text-red-500' },
              { label: 'Jours de sport', value: totalSportJours, unit: 'j', color: 'text-gray-800' },
              { label: 'Semaines', value: semaines.length, unit: '', color: 'text-gray-800' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}<span className="text-sm font-normal ml-0.5 text-gray-400">{kpi.unit}</span></p>
              </div>
            ))}
          </div>

          {/* Progression charge max exercices */}
          <Section title="📈 Progression des charges">
            {progressionExos.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune donnée de charges disponible.</p>
            ) : (
              <div className="space-y-4">
                {/* Top gains */}
                {gainers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-2">✓ Progressions</p>
                    <div className="space-y-3">
                      {gainers.map(ex => (
                        <div key={ex.nom}>
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <span className="text-sm font-medium text-gray-800">{ex.nom}</span>
                              <span className="ml-2 text-xs text-gray-400">{ex.muscle}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{ex.first}kg → {ex.last}kg</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ex.delta > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                                {ex.delta > 0 ? '+' : ''}{ex.delta}kg ({ex.deltaPct > 0 ? '+' : ''}{ex.deltaPct}%)
                              </span>
                            </div>
                          </div>
                          {ex.series.length > 1 && (
                            <MiniLine data={ex.series} dataKey="charge" color="#10b981" height={80} unit="kg" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Déclins */}
                {decliners.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 mb-2">⚠ À surveiller</p>
                    <div className="space-y-2">
                      {decliners.map(ex => (
                        <div key={ex.nom} className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-700">{ex.nom}</span>
                            <span className="ml-2 text-xs text-gray-400">{ex.muscle}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{ex.first}kg → {ex.last}kg</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                              {ex.delta}kg ({ex.deltaPct}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tableau complet tous les exos */}
                <details>
                  <summary className="text-xs text-brand-600 cursor-pointer hover:text-brand-800 font-medium mt-2">
                    Voir tous les exercices ({progressionExos.length})
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400">
                          <th className="text-left py-2">Exercice</th>
                          <th className="text-left py-2">Muscle</th>
                          <th className="text-right py-2">Départ</th>
                          <th className="text-right py-2">Fin</th>
                          <th className="text-right py-2">Δ kg</th>
                          <th className="text-right py-2">Δ %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressionExos.map(ex => (
                          <tr key={ex.nom} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-1.5 font-medium text-gray-800">{ex.nom}</td>
                            <td className="py-1.5 text-gray-500">{ex.muscle}</td>
                            <td className="py-1.5 text-right text-gray-600">{ex.first}kg</td>
                            <td className="py-1.5 text-right text-gray-600">{ex.last}kg</td>
                            <td className={`py-1.5 text-right font-semibold ${ex.delta > 0 ? 'text-green-600' : ex.delta < 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {ex.delta > 0 ? '+' : ''}{ex.delta}
                            </td>
                            <td className={`py-1.5 text-right font-semibold ${ex.deltaPct > 0 ? 'text-green-600' : ex.deltaPct < 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {ex.deltaPct > 0 ? '+' : ''}{ex.deltaPct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </Section>

          {/* 1RM estimé SBD */}
          {hasMainLifts && oneRMProgression.length > 0 && (
            <Section title="🏋️ Évolution 1RM estimé (Epley)">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={oneRMProgression} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={42} />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v, n) => [`${v}kg`, n]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {oneRMProgression.some(d => d.squat)    && <Line type="monotone" dataKey="squat"    stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Squat" />}
                  {oneRMProgression.some(d => d.bench)    && <Line type="monotone" dataKey="bench"    stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Bench" />}
                  {oneRMProgression.some(d => d.deadlift) && <Line type="monotone" dataKey="deadlift" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Deadlift" />}
                  {oneRMProgression.some(d => d.total)    && <Line type="monotone" dataKey="total"    stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} connectNulls name="Total" />}
                </LineChart>
              </ResponsiveContainer>
              {/* Tableau résumé S1 → Sfin */}
              {oneRMProgression.length >= 2 && (
                <div className="mt-3 grid grid-cols-4 gap-3">
                  {(['squat', 'bench', 'deadlift', 'total']).map(lift => {
                    const first = oneRMProgression.find(d => d[lift])
                    const last  = [...oneRMProgression].reverse().find(d => d[lift])
                    if (!first || !last) return null
                    const delta = Math.round((last[lift] - first[lift]) * 10) / 10
                    return (
                      <div key={lift} className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400 capitalize">{lift}</p>
                        <p className="text-lg font-bold text-gray-800">{last[lift]}kg</p>
                        <p className={`text-xs font-semibold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {delta > 0 ? '+' : ''}{delta}kg
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          {/* Volume & tonnage */}
          <Section title="📊 Volume & tonnage">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Tonnage total par semaine</p>
                <MiniBar data={tonnageParSemaine} dataKey="tonnage" color="#6366f1" height={130} unit=" kg" />
              </div>

              {/* Complétion par semaine */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Taux de complétion des séances</p>
                <MiniBar data={seancesCompletion} dataKey="pct" color="#10b981" height={100} unit="%" />
              </div>

              {/* Volume par muscle */}
              {volumeParMuscle.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Volume total par groupe musculaire</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400">
                          <th className="text-left py-2">Muscle</th>
                          <th className="text-right py-2">Tonnage total</th>
                          <th className="text-right py-2">%</th>
                          <th className="py-2 pl-3 w-32"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {volumeParMuscle.map(({ muscle, volume }) => {
                          const pct = totalTonnage > 0 ? Math.round((volume / totalTonnage) * 100) : 0
                          return (
                            <tr key={muscle} className="border-b border-gray-50">
                              <td className="py-1.5 font-medium text-gray-700">{muscle}</td>
                              <td className="py-1.5 text-right text-gray-600">{volume.toLocaleString('fr')} kg</td>
                              <td className="py-1.5 text-right text-gray-400">{pct}%</td>
                              <td className="py-1.5 pl-3">
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-brand-400 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Évolution volume par muscle semaine par semaine */}
              {volumeMuscleSemaine.length > 1 && topMuscles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Évolution volume par muscle</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={volumeMuscleSemaine} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="semaine" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={42} />
                      <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => [`${v.toLocaleString('fr')} kg`]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                      {topMuscles.map((muscle, i) => (
                        <Line key={muscle} type="monotone" dataKey={muscle}
                          stroke={MUSCLE_COLORS[i % MUSCLE_COLORS.length]}
                          strokeWidth={2} dot={{ r: 2 }} connectNulls name={muscle} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Section>

          {/* Données de suivi */}
          {trackingBySemaine.length > 0 && (
            <Section title="📋 Suivi nutrition & bien-être">
              <div className="space-y-4">
                {/* KPIs moyennes bloc */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Kcal moy.', value: avgKcal, unit: 'kcal', target: objectifs?.kcal },
                    { label: 'Sommeil moy.', value: avgSommeil, unit: 'h', target: objectifs?.sommeil },
                    { label: 'Jours sport', value: totalSportJours, unit: 'j total', target: null },
                    { label: 'Semaines avec données', value: trackingBySemaine.length, unit: `/${semaines.length}`, target: null },
                  ].filter(k => k.value != null).map(kpi => (
                    <div key={kpi.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400">{kpi.label}</p>
                      <p className="text-lg font-bold text-gray-800">{kpi.value}<span className="text-xs font-normal text-gray-400 ml-0.5">{kpi.unit}</span></p>
                      {kpi.target && <p className="text-xs text-gray-400">Objectif : {kpi.target}{kpi.unit.replace('moy.','').replace(' total','')}</p>}
                    </div>
                  ))}
                </div>

                {/* Kcal */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Calories moyennes / semaine</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={trackingBySemaine.filter(s => s.kcal)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="semaine" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => [`${v} kcal`]} />
                      <Bar dataKey="kcal" fill="#6366f1" radius={[3,3,0,0]} name="Kcal" />
                      {objectifs?.kcal && (
                        <Line type="monotone" dataKey={() => objectifs.kcal} stroke="#a5b4fc" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Objectif" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Tableau semaine par semaine */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400">
                        <th className="text-left py-2">Semaine</th>
                        <th className="text-right py-2">Sport</th>
                        <th className="text-right py-2">Kcal</th>
                        <th className="text-right py-2">Prot.</th>
                        <th className="text-right py-2">Gluc.</th>
                        <th className="text-right py-2">Lip.</th>
                        <th className="text-right py-2">Sommeil</th>
                        <th className="text-right py-2">Pas</th>
                        <th className="text-right py-2">Stress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackingBySemaine.map(s => (
                        <tr key={s.semaine} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-1.5 font-medium text-gray-700">{s.semaine}</td>
                          <td className="py-1.5 text-right text-gray-600">{s.sport}j</td>
                          <td className="py-1.5 text-right text-gray-600">{s.kcal ?? '—'}</td>
                          <td className="py-1.5 text-right text-gray-600">{s.proteines ?? '—'}</td>
                          <td className="py-1.5 text-right text-gray-600">{s.glucides ?? '—'}</td>
                          <td className="py-1.5 text-right text-gray-600">{s.lipides ?? '—'}</td>
                          <td className="py-1.5 text-right text-gray-600">{s.sommeil ?? '—'}h</td>
                          <td className="py-1.5 text-right text-gray-600">{s.pas ? Math.round(s.pas).toLocaleString('fr') : '—'}</td>
                          <td className="py-1.5 text-right text-gray-600">{s.stress ?? '—'}</td>
                        </tr>
                      ))}
                      {/* Ligne moyennes */}
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                        <td className="py-2 text-xs text-gray-500">Moyenne</td>
                        {[
                          trackingBySemaine.filter(s=>s.sport).length ? Math.round(trackingBySemaine.reduce((a,s)=>a+s.sport,0)/trackingBySemaine.length*10)/10 + 'j' : '—',
                          avgKcal ?? '—',
                          trackingBySemaine.filter(s=>s.proteines).length ? Math.round(trackingBySemaine.filter(s=>s.proteines).reduce((a,s)=>a+s.proteines,0)/trackingBySemaine.filter(s=>s.proteines).length) : '—',
                          trackingBySemaine.filter(s=>s.glucides).length ? Math.round(trackingBySemaine.filter(s=>s.glucides).reduce((a,s)=>a+s.glucides,0)/trackingBySemaine.filter(s=>s.glucides).length) : '—',
                          trackingBySemaine.filter(s=>s.lipides).length ? Math.round(trackingBySemaine.filter(s=>s.lipides).reduce((a,s)=>a+s.lipides,0)/trackingBySemaine.filter(s=>s.lipides).length) : '—',
                          avgSommeil ? avgSommeil+'h' : '—',
                          trackingBySemaine.filter(s=>s.pas).length ? Math.round(trackingBySemaine.filter(s=>s.pas).reduce((a,s)=>a+s.pas,0)/trackingBySemaine.filter(s=>s.pas).length).toLocaleString('fr') : '—',
                          trackingBySemaine.filter(s=>s.stress).length ? parseFloat((trackingBySemaine.filter(s=>s.stress).reduce((a,s)=>a+s.stress,0)/trackingBySemaine.filter(s=>s.stress).length).toFixed(1)) : '—',
                        ].map((v, i) => (
                          <td key={i} className="py-2 text-right text-gray-700 text-xs">{v}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Évolution poids */}
                {poidsEvolution.length > 1 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Évolution du poids</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={poidsEvolution} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => [`${v} kg`]} />
                        <Line type="monotone" dataKey="poids" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} name="Poids" />
                      </LineChart>
                    </ResponsiveContainer>
                    {poidsEvolution.length >= 2 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {poidsEvolution[0].poids} kg → {poidsEvolution[poidsEvolution.length - 1].poids} kg
                        <span className={`ml-2 font-semibold ${
                          poidsEvolution[poidsEvolution.length-1].poids - poidsEvolution[0].poids > 0
                            ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          {poidsEvolution[poidsEvolution.length-1].poids - poidsEvolution[0].poids > 0 ? '+' : ''}
                          {Math.round((poidsEvolution[poidsEvolution.length-1].poids - poidsEvolution[0].poids) * 10) / 10} kg
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Bouton fermer bas */}
          <div className="flex justify-end pt-2">
            <button onClick={onClose}
              className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700">
              Fermer le compte rendu
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
