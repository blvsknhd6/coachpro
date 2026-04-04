import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import WidgetConfig from '../../components/shared/WidgetConfig'
import { findActiveSemaine } from '../../lib/semaine'
import { metricColor, computeAverages } from '../../lib/tracking'

export default function CoachHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { isWidgetEnabled } = usePreferences()
  const [showConfig, setShowConfig] = useState(false)
  const [loading, setLoading]       = useState(true)

  // Athletes
  const [athletes, setAthletes]               = useState([])
  const [athleteTracking, setAthleteTracking] = useState({})
  const [athleteObjectifs, setAthleteObjectifs] = useState({})

  // Personal (self-profile)
  const [myNextSeance, setMyNextSeance] = useState(null)
  const [mySuivi, setMySuivi]           = useState(null)
  const [myMacros, setMyMacros]         = useState(null)
  const [myObjectifs, setMyObjectifs]   = useState(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    setLoading(true)

    const { data: aths } = await supabase
      .from('profiles')
      .select('id, full_name, genre, is_self, blocs(id)')
      .eq('coach_id', profile.id)
      .order('is_self', { ascending: false })
      .order('full_name')
    setAthletes(aths || [])

    const athIds = (aths || []).map(a => a.id)
    if (!athIds.length) { setLoading(false); return }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

    // Batch — tracking + objectifs pour tous les athlètes
    const [trackingRes, blocsRes] = await Promise.all([
      supabase.from('data_tracking')
        .select('athlete_id, date, sport_fait, kcal, proteines, sommeil, pas_journaliers, stress')
        .in('athlete_id', athIds)
        .gte('date', sevenDaysAgoStr)
        .order('date'),
      supabase.from('blocs')
        .select('athlete_id, objectifs_bloc(*)')
        .in('athlete_id', athIds)
        .order('created_at', { ascending: false }),
    ])

    // Tracking par athlète
    const trackingMap = {}
    for (const athId of athIds) {
      const entries = (trackingRes.data || []).filter(t => t.athlete_id === athId)
      if (!entries.length) { trackingMap[athId] = null; continue }
      const avgs = computeAverages(entries, ['kcal', 'proteines', 'sommeil', 'stress', 'pas'])
      trackingMap[athId] = {
        avgs,
        sportJours: entries.filter(e => e.sport_fait).length,
        lastDate:   entries[entries.length - 1]?.date,
        nbJours:    entries.length,
      }
    }
    setAthleteTracking(trackingMap)

    // Objectifs par athlète (bloc le plus récent)
    const objMap = {}
    const seen   = new Set()
    for (const bloc of (blocsRes.data || [])) {
      if (!seen.has(bloc.athlete_id)) {
        seen.add(bloc.athlete_id)
        objMap[bloc.athlete_id] = Array.isArray(bloc.objectifs_bloc)
          ? bloc.objectifs_bloc[0]
          : bloc.objectifs_bloc
      }
    }
    setAthleteObjectifs(objMap)

    // Données personnelles — le coach lui-même (blocs avec athlete_id = profile.id)
    await fetchPersonalData(profile.id)

    setLoading(false)
  }

  async function fetchPersonalData(athleteId) {
    const { data: blocs } = await supabase
      .from('blocs').select('id, objectifs_bloc(*)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false }).limit(1)
    if (!blocs?.length) return

    const bloc = blocs[0]
    const obj  = Array.isArray(bloc.objectifs_bloc) ? bloc.objectifs_bloc[0] : bloc.objectifs_bloc
    setMyObjectifs(obj)

    // Prochaine séance
    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').eq('bloc_id', bloc.id).order('numero')
    if (semaines?.length) {
      const activeSem = await findActiveSemaine(semaines, athleteId)
      const { data: sc } = await supabase
        .from('seances')
        .select('id, nom, ordre, exercices(id, series_realisees(id))')
        .eq('semaine_id', activeSem.id).order('ordre')

      // Priorité : séance pas commencée → séance en cours → rien
      const seancesNormales = (sc || []).filter(s => s.nom !== 'Bonus' && (s.exercices?.length || 0) > 0)
      const pasCommencee    = seancesNormales.find(s =>
        s.exercices.filter(e => (e.series_realisees?.length || 0) > 0).length === 0
      )
      const enCours = seancesNormales.find(s => {
        const done = s.exercices.filter(e => (e.series_realisees?.length || 0) > 0).length
        return done > 0 && done < s.exercices.length
      })
      const next = pasCommencee || enCours
      if (next) setMyNextSeance({ seance: next, semaineId: activeSem.id })
    }

    // Suivi 7j
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: tracking } = await supabase
      .from('data_tracking').select('*')
      .eq('athlete_id', athleteId).eq('bloc_id', bloc.id)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false }).limit(7)
    if (tracking?.length) {
      const avgs = computeAverages(tracking, ['kcal', 'proteines', 'glucides', 'lipides', 'sommeil', 'pas', 'stress'])
      setMySuivi({ avgs, sportJours: tracking.filter(d => d.sport_fait).length, nbJours: tracking.length })
    }

    // Macros du jour
    const { data: repas } = await supabase
      .from('repas').select('kcal, proteines, glucides, lipides')
      .eq('athlete_id', athleteId).eq('date', today)
    if (repas?.length) {
      setMyMacros(repas.reduce((acc, r) => ({
        kcal:      acc.kcal      + (Number(r.kcal)      || 0),
        proteines: acc.proteines + (Number(r.proteines) || 0),
        glucides:  acc.glucides  + (Number(r.glucides)  || 0),
        lipides:   acc.lipides   + (Number(r.lipides)   || 0),
      }), { kcal: 0, proteines: 0, glucides: 0, lipides: 0 }))
    }
  }

  function relativeDate(dateStr) {
    if (!dateStr) return 'jamais'
    const diff = Math.floor((new Date() - new Date(dateStr + 'T12:00:00')) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const bornes     = myObjectifs?.bornes || {}

  const SUIVI_METRICS = [
    { key: 'kcal',      label: 'Kcal',    unit: '',    isInt: true  },
    { key: 'proteines', label: 'Prot.',   unit: 'g',   isInt: true  },
    { key: 'glucides',  label: 'Gluc.',   unit: 'g',   isInt: true  },
    { key: 'lipides',   label: 'Lip.',    unit: 'g',   isInt: true  },
    { key: 'sommeil',   label: 'Sommeil', unit: 'h',   isInt: false },
    { key: 'pas',       label: 'Pas',     unit: '',    isInt: true  },
    { key: 'stress',    label: 'Stress',  unit: '/10', isInt: false },
  ]

  return (
    <Layout>
      {showConfig && <WidgetConfig onClose={() => setShowConfig(false)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
          <h1 className="text-xl font-semibold">Bonjour {profile?.full_name?.split(' ')[0]}</h1>
        </div>
        <button onClick={() => setShowConfig(true)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5">
          Widgets
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">

          {/* ── Prochaine séance ── */}
          {isWidgetEnabled('next_seance') && (
            myNextSeance ? (
              <div className="bg-brand-600 text-white rounded-2xl p-4">
                <p className="text-xs font-medium opacity-70 mb-0.5">Ma prochaine séance</p>
                <p className="text-base font-semibold mb-2">{myNextSeance.seance.nom}</p>
                <button
                  onClick={() => navigate(`/coach/my-training/seance/${myNextSeance.seance.id}/semaine/${myNextSeance.semaineId}`)}
                  className="bg-white text-brand-700 px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-90">
                  Commencer
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">Aucune séance programmée</p>
                <Link to="/coach/mon-programme" className="text-xs text-brand-600 font-medium">Créer un programme →</Link>
              </div>
            )
          )}

          {/* ── Mon suivi 7j ── */}
          {isWidgetEnabled('suivi_perso') && (
            mySuivi ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">Mon suivi — 7 derniers jours</p>
                  <Link to="/coach/tracking" className="text-xs text-brand-600 font-medium">Remplir →</Link>
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8">
                  {/* Sport */}
                  <div className="flex flex-col items-center">
                    <span className={`text-sm font-semibold ${metricColor(mySuivi.sportJours, 'seances', myObjectifs, bornes) || 'text-gray-800'}`}>
                      {mySuivi.sportJours}j
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5">Sport</span>
                  </div>
                  {SUIVI_METRICS.map(({ key, label, unit, isInt }) => {
                    const val = mySuivi.avgs[key]
                    if (val == null) return null
                    const color     = metricColor(val, key, myObjectifs, bornes)
                    const displayed = key === 'pas'
                      ? Math.round(val).toLocaleString('fr')
                      : isInt ? Math.round(val) : parseFloat(val).toFixed(1)
                    return (
                      <div key={key} className="flex flex-col items-center">
                        <span className={`text-sm font-semibold tabular-nums ${color || 'text-gray-800'}`}>{displayed}{unit}</span>
                        <span className="text-xs text-gray-400 mt-0.5 truncate">{label}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-300 mt-2 text-right">moyennes sur {mySuivi.nbJours} entrée{mySuivi.nbJours > 1 ? 's' : ''}</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">Aucune donnée de suivi ces 7 derniers jours</p>
                <Link to="/coach/tracking" className="text-xs text-brand-600 font-medium">Remplir →</Link>
              </div>
            )
          )}

          {/* ── Mes macros du jour ── */}
          {isWidgetEnabled('macros_jour') && (
            myMacros ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">Mes macros du jour</p>
                  <Link to="/coach/tracking" className="text-xs text-brand-600 font-medium">Suivi complet →</Link>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ['Kcal',  myMacros.kcal,      myObjectifs?.kcal,      '' ],
                    ['Prot.', myMacros.proteines,  myObjectifs?.proteines, 'g'],
                    ['Gluc.', myMacros.glucides,   myObjectifs?.glucides,  'g'],
                    ['Lip.',  myMacros.lipides,    myObjectifs?.lipides,   'g'],
                  ].map(([label, val, target, unit]) => {
                    const pct = target && val ? Math.min(100, Math.round((val / target) * 100)) : 0
                    return (
                      <div key={label}>
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <p className="text-sm font-semibold text-gray-900">{Math.round(val || 0)}{unit}</p>
                        {target && (
                          <>
                            <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">/ {target}{unit}</p>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">Aucun repas renseigné aujourd'hui</p>
                <Link to="/coach/tracking" className="text-xs text-brand-600 font-medium">Remplir →</Link>
              </div>
            )
          )}

          {/* ── Saisie repas IA ── */}
          {isWidgetEnabled('saisie_repas') && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Saisie repas IA</p>
              </div>
              {/* Ajoute ici le composant ou le bouton vers ton interface d'IA */}
              <div className="text-sm text-gray-500">
                Interface de saisie à intégrer ici...
              </div>
            </div>
          )}

          {/* ── Séances de la semaine ── */}
          {isWidgetEnabled('semaine_seances') && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Séances de la semaine</p>
                <Link to="/coach/mon-programme" className="text-xs text-brand-600 font-medium">Voir tout →</Link>
              </div>
              {/* Ajoute ici la logique pour lister les séances (en utilisant myNextSeance ou en requêtant la semaine) */}
              <div className="text-sm text-gray-500">
                Liste des séances à intégrer ici...
              </div>
            </div>
          )}

          {/* ── Liste coachés avec tracking ── */}
          {isWidgetEnabled('liste_coachés') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Mes coachés</p>
                <Link to="/coach/athletes" className="text-xs text-brand-600 font-medium">Voir tout →</Link>
              </div>
              {athletes.filter(a => !a.is_self).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aucun coaché pour l'instant.</p>
              ) : athletes.filter(a => !a.is_self).map(a => {
                const tr  = athleteTracking[a.id]
                const obj = athleteObjectifs[a.id]
                const b   = obj?.bornes || {}
                return (
                  <Link key={a.id} to={`/coach/athlete/${a.id}`}
                    className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between hover:border-brand-200 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${a.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                        {initiales(a.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700 truncate">{a.full_name}</p>
                        {tr ? (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-xs ${metricColor(tr.sportJours, 'seances', obj, b) || 'text-gray-500'}`}>
                              {tr.sportJours}j sport
                            </span>
                            {tr.avgs.kcal != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.kcal, 'kcal', obj, b) || 'text-gray-500'}`}>
                                {Math.round(tr.avgs.kcal)} kcal
                              </span>
                            )}
                            {tr.avgs.proteines != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.proteines, 'proteines', obj, b) || 'text-gray-500'}`}>
                                P{Math.round(tr.avgs.proteines)}g
                              </span>
                            )}
                            {tr.avgs.sommeil != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.sommeil, 'sommeil', obj, b) || 'text-gray-500'}`}>
                                {parseFloat(tr.avgs.sommeil).toFixed(1)}h
                              </span>
                            )}
                            {tr.avgs.stress != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.stress, 'stress', obj, b) || 'text-gray-500'}`}>
                                stress {parseFloat(tr.avgs.stress).toFixed(1)}
                              </span>
                            )}
                            <span className="text-xs text-gray-300">{relativeDate(tr.lastDate)}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">Aucune donnée récente</p>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm ml-2 flex-shrink-0">›</span>
                  </Link>
                )
              })}
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
