import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'
import { findActiveSemaine } from '../../lib/semaine'

export default function AthleteEntrainement() {
  const { profile } = useAuth()
  const theme = useTheme()
  const [blocs, setBlocs]               = useState([])
  const [activeBloc, setActiveBloc]     = useState(null)
  const [semaines, setSemaines]         = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]           = useState([])
  const [activitesRealisees, setActivitesRealisees] = useState({})
  const [loading, setLoading]           = useState(true)
  const [newActivite, setNewActivite]   = useState('')
  const [addingActivite, setAddingActivite] = useState(false)

  useEffect(() => { if (profile) fetchBlocs() }, [profile])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBlocs() {
    const { data } = await supabase
      .from('blocs')
      .select('id, name')
      .eq('athlete_id', profile.id)
      .order('created_at', { ascending: false })
    setBlocs(data || [])
    if (data?.length) { setActiveBloc(data[0]); fetchSemaines(data[0].id) }
    else setLoading(false)
  }

  async function fetchSemaines(blocId) {
    const { data } = await supabase
      .from('semaines')
      .select('id, numero')
      .eq('bloc_id', blocId)
      .order('numero')
    setSemaines(data || [])
    if (data?.length) {
      const active = await findActiveSemaine(data, profile.id)
      setActiveSemaine(active)
    } else {
      setLoading(false)
    }
  }

  async function fetchSeances(semaineId) {
    setLoading(true)

    const [seancesRes, activitesRes] = await Promise.all([
      supabase
        .from('seances')
        .select(`
          id, nom, ordre,
          exercices(
            id, sets,
            series_realisees(id, reps, charge)
          ),
          activites_bonus(id, nom, ordre)
        `)
        .eq('semaine_id', semaineId)
        .eq('exercices.series_realisees.athlete_id', profile.id)
        .eq('exercices.series_realisees.semaine_id', semaineId)
        .order('ordre'),
      supabase
        .from('activites_realisees')
        .select('activite_id, realisee')
        .eq('athlete_id', profile.id)
        .eq('semaine_id', semaineId),
    ])

    setSeances(seancesRes.data || [])

    const map = {}
    ;(activitesRes.data || []).forEach(r => { map[r.activite_id] = r.realisee })
    setActivitesRealisees(map)
    setLoading(false)
  }

  async function toggleActivite(activiteId) {
    const newVal = !activitesRealisees[activiteId]
    setActivitesRealisees(prev => ({ ...prev, [activiteId]: newVal }))
    await supabase.from('activites_realisees').upsert({
      activite_id: activiteId,
      semaine_id: activeSemaine.id,
      athlete_id: profile.id,
      realisee: newVal,
    }, { onConflict: 'activite_id,semaine_id,athlete_id' })
  }

  async function addCustomActivite(seanceId) {
    if (!newActivite.trim()) return
    const seance = seances.find(s => s.id === seanceId)
    const ordre = seance?.activites_bonus?.length || 0
    const { data } = await supabase
      .from('activites_bonus')
      .insert({ seance_id: seanceId, nom: newActivite.trim(), ordre })
      .select()
      .single()
    if (data) {
      setSeances(prev => prev.map(s =>
        s.id === seanceId ? { ...s, activites_bonus: [...(s.activites_bonus || []), data] } : s
      ))
      setNewActivite('')
      setAddingActivite(false)
    }
  }

  // Feature 2 : calcul état d'une séance
  function getSeanceStatus(sc) {
    const exs = sc.exercices || []
    if (!exs.length) return 'empty'
    // Nb de séries avec au moins reps ou charge renseigné
    const totalSets = exs.reduce((acc, ex) => acc + (ex.sets || 0), 0)
    const doneSets  = exs.reduce((acc, ex) =>
      acc + (ex.series_realisees || []).filter(s => s.reps || s.charge).length, 0
    )
    if (doneSets === 0) return 'not_started'
    if (doneSets >= totalSets) return 'complete'
    return 'partial'
  }

  const accentText  = theme.isFemme ? 'text-pink-600' : 'text-brand-600'
  const accentBg    = theme.isFemme ? 'bg-pink-600' : 'bg-brand-600'
  const accentLight = theme.isFemme ? 'bg-pink-50 text-pink-700 border-pink-200' : 'bg-brand-50 text-brand-700 border-brand-200'

  const bonusSeance     = seances.find(s => s.nom === 'Bonus')
  const seancesNormales = seances.filter(s => s.nom !== 'Bonus')

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-4">Mon entraînement</h1>

      {blocs.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {blocs.map(b => (
            <button key={b.id}
              onClick={() => { setActiveBloc(b); setSeances([]); setSemaines([]); fetchSemaines(b.id) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeBloc?.id === b.id ? `${accentBg} text-white` : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {semaines.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {semaines.map(s => (
            <button key={s.id} onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              S{s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {seancesNormales.map(sc => {
            const total  = sc.exercices?.length || 0
            const status = getSeanceStatus(sc)
            const doneSets  = sc.exercices?.reduce((acc, ex) =>
              acc + (ex.series_realisees || []).filter(s => s.reps || s.charge).length, 0) || 0
            const totalSets = sc.exercices?.reduce((acc, ex) => acc + (ex.sets || 0), 0) || 0
            const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0

            return (
              <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                className="bg-white border border-gray-100 rounded-xl p-4 block hover:shadow-sm transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <p className={`font-medium text-sm text-gray-900 group-hover:${accentText}`}>{sc.nom}</p>

                  {/* Feature 2 : badge état enrichi */}
                  {status === 'complete' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                      ✓ Terminé
                    </span>
                  )}
                  {status === 'partial' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-600">
                      ⚠ En cours · {doneSets}/{totalSets}
                    </span>
                  )}
                  {status === 'not_started' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-50 text-gray-400">
                      {total} exercice{total !== 1 ? 's' : ''}
                    </span>
                  )}
                  {status === 'empty' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-50 text-gray-300">
                      —
                    </span>
                  )}
                </div>

                {/* Barre de progression par sets (Feature 2 : couleur selon état) */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      status === 'complete' ? 'bg-green-500'
                      : status === 'partial' ? 'bg-amber-400'
                      : theme.progress
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Feature 2 : détail exercices partiellement faits */}
                {status === 'partial' && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sc.exercices?.map(ex => {
                      const doneEx = (ex.series_realisees || []).filter(s => s.reps || s.charge).length
                      const totalEx = ex.sets || 0
                      if (doneEx === 0 || doneEx >= totalEx) return null
                      return (
                        <span key={ex.id} className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded">
                          {doneEx}/{totalEx} sets incomplets
                        </span>
                      )
                    })}
                  </div>
                )}
              </Link>
            )
          })}

          {bonusSeance && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Activités bonus</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(bonusSeance.activites_bonus || []).sort((a, b) => a.ordre - b.ordre).map(act => {
                  const done = !!activitesRealisees[act.id]
                  return (
                    <button key={act.id} onClick={() => toggleActivite(act.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${done ? accentLight : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                      {done ? '✓ ' : ''}{act.nom}
                    </button>
                  )
                })}
              </div>
              {addingActivite ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newActivite}
                    onChange={e => setNewActivite(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomActivite(bonusSeance.id)}
                    placeholder="Nom de l'activité…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  <button onClick={() => addCustomActivite(bonusSeance.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${accentBg} text-white`}>OK</button>
                  <button onClick={() => { setAddingActivite(false); setNewActivite('') }}
                    className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600">Ann.</button>
                </div>
              ) : (
                <button onClick={() => setAddingActivite(true)}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 w-full transition-colors">
                  + Ajouter une activité
                </button>
              )}
            </div>
          )}

          {seances.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Ton coach n'a pas encore créé de programme.</p>
          )}
        </div>
      )}
    </Layout>
  )
}
