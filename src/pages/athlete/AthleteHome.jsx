import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import WidgetConfig from '../../components/shared/WidgetConfig'
import { findActiveSemaine } from '../../lib/semaine'
import { metricColor, computeAverages } from '../../lib/tracking'
import { calcTDEE } from '../../lib/tdee'
import { fetchPeriodLogs } from '../../lib/cycleService'
import { getCycleStatus } from '../../lib/cycleUtils'

export default function AthleteHome() {
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const { isWidgetEnabled } = usePreferences()
  const [showConfig, setShowConfig]       = useState(false)

  const [nextSeance, setNextSeance]       = useState(null)
  const [objectifs, setObjectifs]         = useState(null)
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [loadingTdee, setLoadingTdee]     = useState(false)
  const [activeBlocId, setActiveBlocId]   = useState(null)

  const [suiviSemaine, setSuiviSemaine]   = useState(null)
  const [tdeeData, setTdeeData]           = useState(null)
  const [cycleStatus, setCycleStatus]     = useState(null)
  const [confirmCycleToday, setConfirmCycleToday] = useState(false)
  const [savingCycle, setSavingCycle]             = useState(false)

  const today      = new Date().toISOString().split('T')[0]
  const accentText = theme.isFemme ? 'text-pink-600' : 'text-brand-600'
  const accentBg   = theme.isFemme ? 'bg-pink-600'   : 'bg-brand-600'
  const bornes     = objectifs?.bornes || {}

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    const { data: blocs } = await supabase
      .from('blocs').select('id, name, objectifs_bloc(*)')
      .eq('athlete_id', profile.id).order('created_at', { ascending: false }).limit(1)

    if (blocs?.[0]) {
      setActiveBlocId(blocs[0].id)
      const obj = Array.isArray(blocs[0].objectifs_bloc) ? blocs[0].objectifs_bloc[0] : blocs[0].objectifs_bloc
      setObjectifs(obj)
      fetchSemaines(blocs[0].id)
      fetchSuiviSemaine(blocs[0].id)
      fetchTdee(blocs[0].id)
    } else {
      setLoading(false)
    }

    if (profile.genre === 'femme') {
      const { data: cycleLogs } = await fetchPeriodLogs(profile.id)
      setCycleStatus(getCycleStatus(cycleLogs))
    }
  }

  async function fetchSemaines(blocId) {
    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').eq('bloc_id', blocId).order('numero')
    if (!semaines?.length) { setLoading(false); return }

    const activeSem = await findActiveSemaine(semaines, profile.id)
    setActiveSemaine(activeSem)

    const { data: sc } = await supabase
      .from('seances')
      .select('id, nom, ordre, exercices(id, sets, series_realisees(id, reps, charge))')
      .eq('semaine_id', activeSem.id)
      .eq('exercices.series_realisees.athlete_id', profile.id)
      .eq('exercices.series_realisees.semaine_id', activeSem.id)
      .order('ordre')
    setSeances(sc || [])

    const seancesNormales = (sc || []).filter(s => s.nom !== 'Bonus' && (s.exercices?.length || 0) > 0)

    // Feature 2 : chercher séance en cours (partielle) en priorité, sinon pas commencée
    const enCours = seancesNormales.find(s => {
      const totalSets = s.exercices.reduce((acc, e) => acc + (e.sets || 0), 0)
      const doneSets  = s.exercices.reduce((acc, e) => acc + (e.series_realisees?.filter(sr => sr.reps || sr.charge).length || 0), 0)
      return doneSets > 0 && doneSets < totalSets
    })
    const pasCommencee = seancesNormales.find(s =>
      s.exercices.every(e => (e.series_realisees?.length || 0) === 0)
    )
    if (enCours || pasCommencee) setNextSeance({ seance: enCours || pasCommencee, semaineId: activeSem.id })
    setLoading(false)
  }

  async function fetchSuiviSemaine(blocId) {
    const { data } = await supabase.from('data_tracking').select('*')
      .eq('athlete_id', profile.id).eq('bloc_id', blocId)
      .eq('vacances', false) // exclure les jours vacances des moyennes
      .order('date', { ascending: false }).limit(7)
    if (!data?.length) return
    const avgs = computeAverages(data, ['kcal', 'proteines', 'glucides', 'lipides', 'sommeil', 'pas', 'stress'])
    setSuiviSemaine({ avgs, sportJours: data.filter(d => d.sport_fait).length, nbJours: data.length })
  }

  async function fetchTdee(blocId) {
    if (!profile?.taille || !profile?.date_naissance) return
    setLoadingTdee(true)

    const { data: poidsData } = await supabase
      .from('data_tracking').select('poids, date')
      .eq('athlete_id', profile.id).not('poids', 'is', null)
      .order('date', { ascending: false }).limit(1)

    const poids = poidsData?.[0]?.poids || profile.poids
    if (!poids) { setLoadingTdee(false); return }

    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const { data: tracking } = await supabase
      .from('data_tracking').select('pas_journaliers, sport_fait, date')
      .eq('athlete_id', profile.id)
      .gte('date', thirtyAgo.toISOString().split('T')[0]).order('date')

    const entries           = tracking || []
    const pasVals           = entries.map(e => e.pas_journaliers).filter(v => v != null)
    const pasJournaliersMoy = pasVals.length ? pasVals.reduce((a, b) => a + b, 0) / pasVals.length : 0
    const seancesTracking   = entries.filter(e => e.sport_fait).length / Math.max(1, entries.length / 7)

    const { data: objBloc } = await supabase
      .from('objectifs_bloc').select('pas_journaliers, seances_par_semaine')
      .eq('bloc_id', blocId).single()

    const hasSufficientTracking = entries.length >= 7
    const pasUsed     = hasSufficientTracking ? pasJournaliersMoy    : (objBloc?.pas_journaliers     || profile.pas_journaliers_moy || 0)
    const seancesUsed = hasSufficientTracking ? seancesTracking      : (objBloc?.seances_par_semaine || profile.seances_semaine     || 0)

    const result = calcTDEE(
      {
        poids,
        taille:           profile.taille,
        date_naissance:   profile.date_naissance,
        genre:            profile.genre,
        travail_physique: profile.travail_physique || false,
      },
      { pasJournaliersMoy: pasUsed, seancesParSemaine: seancesUsed }
    )

    if (result) {
      setTdeeData({
        ...result,
        poids,
        pasJournaliersMoy:  Math.round(pasUsed),
        seancesParSemaine:  parseFloat(seancesUsed.toFixed(1)),
        lastPoidsDate:      poidsData?.[0]?.date || 'Onboarding',
        sourceActivite:     hasSufficientTracking ? 'tracking' : 'onboarding',
      })
    }
    setLoadingTdee(false)
  }

  async function handleConfirmCycleToday() {
    setSavingCycle(true)
    try {
      const { data: existingLogs } = await fetchPeriodLogs(profile.id)
      const MAX_LOGS = 10
      if (existingLogs && existingLogs.length >= MAX_LOGS) {
        const oldest = existingLogs[existingLogs.length - 1]
        await deletePeriodLog(oldest.id)
      }
      await upsertPeriodLog(profile.id, today)
      const { data: updatedLogs } = await fetchPeriodLogs(profile.id)
      setCycleStatus(getCycleStatus(updatedLogs))
    } finally {
      setSavingCycle(false)
      setConfirmCycleToday(false)
    }
  }

  const SuiviVal = ({ label, value, bilanKey, unit = '', isInt = true }) => {
    if (value == null) return null
    const displayed = isInt
      ? (bilanKey === 'pas' ? Math.round(value).toLocaleString('fr') : Math.round(value))
      : parseFloat(value).toFixed(1)
    const color = metricColor(value, bilanKey, objectifs, bornes)
    return (
      <div className="flex flex-col items-center min-w-0">
        <span className={`text-sm font-semibold tabular-nums ${color || 'text-gray-800'}`}>{displayed}{unit}</span>
        <span className="text-xs text-gray-400 mt-0.5 truncate">{label}</span>
      </div>
    )
  }

  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Layout>
      {showConfig && <WidgetConfig onClose={() => setShowConfig(false)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
          <h1 className="text-xl font-semibold text-gray-900">Bonjour {profile?.full_name?.split(' ')[0]}</h1>
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

          {/* Prochaine séance */}
          {isWidgetEnabled('next_seance') && nextSeance && (
            <div className={`${accentBg} text-white rounded-2xl p-4`}>
              <p className="text-xs font-medium opacity-70 mb-0.5">
                {nextSeance.seance.series_realisees?.length > 0 ? 'Séance en cours' : 'Prochaine séance'}
              </p>
              <p className="text-base font-semibold mb-2">{nextSeance.seance.nom}</p>
              <button
                onClick={() => navigate(`/athlete/seance/${nextSeance.seance.id}/semaine/${nextSeance.semaineId}`)}
                className="bg-white px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-90"
                style={{ color: theme.isFemme ? '#db2777' : '#4f46e5' }}>
                {nextSeance.seance.series_realisees?.length > 0 ? 'Reprendre' : 'Commencer'}
              </button>
            </div>
          )}

          {/* Widget cycle — femmes uniquement */}
          {theme.isFemme && (
            cycleStatus ? (
              <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-pink-700">{cycleStatus.phaseLabel}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{cycleStatus.dayLabel}</p>
                  </div>
                  <Link to="/athlete/cycle" className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2">
                    Détails →
                  </Link>
                </div>
                <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-pink-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round(((cycleStatus.dayInCycle - 1) / cycleStatus.avgCycleLength) * 100))}%` }} />
                </div>
                <p className="text-xs text-gray-600 italic mb-1.5">{cycleStatus.message}</p>
                <p className="text-xs text-gray-500 mb-3">{cycleStatus.trainingAdvice}</p>

                {!confirmCycleToday ? (
                  <button onClick={() => setConfirmCycleToday(true)}
                    className="text-xs bg-pink-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-pink-700">
                    🩸 Mes règles ont commencé aujourd'hui
                  </button>
                ) : (
                  <div className="bg-white border border-pink-200 rounded-lg p-3">
                    <p className="text-xs text-pink-700 font-medium mb-2">
                      Confirmer le début des règles aujourd'hui ({new Date(today + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}) ?
                    </p>
                    <div className="flex gap-2">
                      <button onClick={handleConfirmCycleToday} disabled={savingCycle}
                        className="flex-1 bg-pink-600 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-pink-700 disabled:opacity-50">
                        {savingCycle ? '…' : 'Confirmer ✓'}
                      </button>
                      <button onClick={() => setConfirmCycleToday(false)}
                        className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs text-gray-600">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {cycleStatus.daysUntilNextPeriod >= 0 && cycleStatus.daysUntilNextPeriod <= 30 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Prochaines règles : {new Date(cycleStatus.predictedNextPeriodDate + 'T12:00:00')
                      .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </p>
                )}
                {cycleStatus.isLowData    && <p className="text-xs text-amber-500 mt-1.5">⚠️ Moins de 3 entrées — estimation approximative</p>}
                {cycleStatus.isIrregular  && <p className="text-xs text-amber-500 mt-1">⚠️ Cycle irrégulier (±{cycleStatus.cycleVariability}j)</p>}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-pink-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Suivi du cycle 🌸</p>
                  <p className="text-xs text-gray-400 mt-0.5">Suis ton cycle pour des conseils adaptés</p>
                </div>
                <Link to="/athlete/cycle"
                  className="text-xs bg-pink-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-pink-700 flex-shrink-0">
                  Commencer →
                </Link>
              </div>
            )
          )}

          {/* Suivi 7 derniers jours */}
          {isWidgetEnabled('suivi_bloc') && suiviSemaine && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Suivi — 7 derniers jours</p>
                <Link to="/athlete/tracking" className={`text-xs ${accentText} font-medium`}>Détail →</Link>
              </div>
              <div className="grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8">
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-semibold ${metricColor(suiviSemaine.sportJours, 'seances', objectifs, bornes) || 'text-gray-800'}`}>
                    {suiviSemaine.sportJours}j
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">Sport</span>
                </div>
                <SuiviVal label="Kcal"    value={suiviSemaine.avgs.kcal}      bilanKey="kcal"      />
                <SuiviVal label="Prot."   value={suiviSemaine.avgs.proteines}  bilanKey="proteines" unit="g" />
                <SuiviVal label="Gluc."   value={suiviSemaine.avgs.glucides}   bilanKey="glucides"  unit="g" />
                <SuiviVal label="Lip."    value={suiviSemaine.avgs.lipides}    bilanKey="lipides"   unit="g" />
                <SuiviVal label="Sommeil" value={suiviSemaine.avgs.sommeil}    bilanKey="sommeil"   unit="h" isInt={false} />
                <SuiviVal label="Pas"     value={suiviSemaine.avgs.pas}        bilanKey="pas"       />
                <SuiviVal label="Stress"  value={suiviSemaine.avgs.stress}     bilanKey="stress"    unit="/10" isInt={false} />
              </div>
              <p className="text-xs text-gray-300 mt-2 text-right">
                moyennes sur {suiviSemaine.nbJours} entrée{suiviSemaine.nbJours > 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* TDEE */}
          {isWidgetEnabled('suivi_bloc') && (
            loadingTdee ? (
              <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ) : tdeeData ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Mon maintien estimé</p>
                  <Link to="/athlete/tracking" className={`text-xs ${accentText} font-medium`}>Mon suivi →</Link>
                </div>
                <p className={`text-2xl font-bold ${accentText}`}>
                  {tdeeData.tdee} <span className="text-sm font-normal text-gray-500">kcal/jour</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">BMR {tdeeData.bmr} kcal · ×{tdeeData.multiplier} · {tdeeData.activityLabel}</p>
                <p className="text-xs text-gray-300 mt-0.5">
                  {tdeeData.poids}kg · {tdeeData.pasJournaliersMoy.toLocaleString('fr')} pas/j · {tdeeData.seancesParSemaine} séances/sem
                  {tdeeData.sourceActivite === 'onboarding' ? ' · données onboarding' : ' · 30j tracking'}
                </p>
                {objectifs?.kcal && (
                  <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${theme.isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700'}`}>
                    <span>🎯</span>
                    <span>
                      Objectif coach : <strong>{objectifs.kcal} kcal/j</strong>
                      {objectifs.plan_nutritionnel && (
                        <span className="ml-1 text-gray-500">
                          ({{'prise_de_masse': 'prise de masse', 'maintien': 'maintien', 'seche': 'sèche'}[objectifs.plan_nutritionnel]})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            ) : (!profile?.taille || !profile?.date_naissance) ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-500 mb-1">Maintien calorique non disponible</p>
                <p className="text-xs text-gray-400">Ton coach doit compléter ta taille et date de naissance.</p>
              </div>
            ) : null
          )}

          {/* Séances de la semaine */}
          {isWidgetEnabled('semaine_seances') && seances.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Semaine {activeSemaine?.numero}</p>
                <Link to="/athlete/entrainement" className={`text-xs ${accentText} font-medium`}>Voir tout</Link>
              </div>
              <div className="space-y-1">
                {seances.filter(s => s.nom !== 'Bonus').map(sc => {
                  const totalSets = sc.exercices?.reduce((acc, e) => acc + (e.sets || 0), 0) || 0
                  const doneSets  = sc.exercices?.reduce((acc, e) =>
                    acc + (e.series_realisees?.filter(sr => sr.reps || sr.charge).length || 0), 0) || 0
                  const complete = doneSets >= totalSets && totalSets > 0
                  const partial  = doneSets > 0 && doneSets < totalSets
                  return (
                    <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors ${
                        complete ? 'bg-green-50' : partial ? 'bg-amber-50' : 'hover:bg-gray-50'
                      }`}>
                      <span className={`text-sm ${complete ? 'text-green-700' : partial ? 'text-amber-700' : 'text-gray-700'}`}>
                        {sc.nom}
                      </span>
                      <span className={`text-xs font-medium ${complete ? 'text-green-600' : partial ? 'text-amber-500' : 'text-gray-400'}`}>
                        {complete ? 'Terminé ✓' : partial ? `${doneSets}/${totalSets} ⚠` : `0/${totalSets}`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
