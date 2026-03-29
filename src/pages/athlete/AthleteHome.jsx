import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'

export default function AthleteHome() {
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const [nextSeance, setNextSeance] = useState(null)
  const [todayTracking, setTodayTracking] = useState(null)
  const [objectifs, setObjectifs] = useState(null)
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeBloc, setActiveBloc] = useState(null)
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances] = useState([])

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    const today = new Date().toISOString().split('T')[0]

    // Blocs et séances
    const { data: blocs } = await supabase.from('blocs').select('*, objectifs_bloc(*)').eq('athlete_id', profile.id).order('created_at', { ascending: false }).limit(1)
    if (blocs?.[0]) {
      setActiveBloc(blocs[0])
      setObjectifs(blocs[0].objectifs_bloc)
      const { data: semaines } = await supabase.from('semaines').select('*').eq('bloc_id', blocs[0].id).order('numero')
      if (semaines?.length) {
        let activeSem = semaines[0]
        for (let i = semaines.length - 1; i >= 0; i--) {
          const { data: seancesIds } = await supabase.from('seances').select('id').eq('semaine_id', semaines[i].id)
          if (!seancesIds?.length) continue
          const { data: sr } = await supabase.from('series_realisees')
            .select('id').eq('athlete_id', profile.id).in('exercice_id', seancesIds.map(s => s.id)).limit(1)
          if (sr?.length) { activeSem = semaines[i]; break }
        }
        setActiveSemaine(activeSem)
        const { data: sc } = await supabase.from('seances')
          .select('*, exercices(*, series_realisees(id)), activites_bonus(*, activites_realisees(id))')
          .eq('semaine_id', activeSem.id).order('ordre')
        setSeances(sc || [])
        const incomplete = (sc || []).find(s => s.nom !== 'Bonus' && (s.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0) < (s.exercices?.length || 0))
        if (incomplete) setNextSeance({ seance: incomplete, semaineId: activeSem.id })
      }
    }

    // Tracking du jour
    const { data: tracking } = await supabase.from('data_tracking').select('*')
      .eq('athlete_id', profile.id).eq('date', today).single()
    setTodayTracking(tracking)

    // Streak (jours consécutifs avec sport)
    const { data: recentTracking } = await supabase.from('data_tracking').select('date, sport_fait')
      .eq('athlete_id', profile.id).eq('sport_fait', true).order('date', { ascending: false }).limit(30)
    let s = 0
    const sortedDates = (recentTracking || []).map(t => t.date).sort().reverse()
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date()
      expected.setDate(expected.getDate() - i)
      if (sortedDates[i] === expected.toISOString().split('T')[0]) s++
      else break
    }
    setStreak(s)

    setLoading(false)
  }

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const obj = Array.isArray(objectifs) ? objectifs[0] : objectifs

  const MacroBar = ({ label, val, target, color }) => {
    const pct = target && val ? Math.min(100, Math.round((val / target) * 100)) : 0
    return (
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500">{label}</span>
          <span className="text-gray-700 font-medium">{val || 0} / {target || '—'}g</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="mb-6">
        <p className="text-sm text-gray-400 capitalize">{today}</p>
        <h1 className="text-2xl font-semibold text-gray-900">Bonjour {profile?.full_name?.split(' ')[0]} 👋</h1>
      </div>

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-4">
          {/* Prochaine séance */}
          {nextSeance && (
            <div className={`${theme.isFemme ? 'bg-pink-600' : 'bg-brand-600'} text-white rounded-2xl p-5`}>
              <p className="text-xs font-medium opacity-70 mb-1">Prochaine séance</p>
              <p className="text-lg font-semibold mb-1">{nextSeance.seance.nom}</p>
              <p className="text-xs opacity-60 mb-3">{nextSeance.seance.exercices?.length || 0} exercices</p>
              <button
                onClick={() => navigate(`/athlete/seance/${nextSeance.seance.id}/semaine/${nextSeance.semaineId}`)}
                className="bg-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ color: theme.isFemme ? '#db2777' : '#4f46e5' }}>
                Commencer →
              </button>
            </div>
          )}

          {/* Streak + stats rapides */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-amber-500">🔥{streak}</p>
              <p className="text-xs text-gray-400 mt-1">Jours consécutifs</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className={`text-2xl font-semibold ${todayTracking?.sport_fait ? 'text-green-500' : 'text-gray-300'}`}>
                {todayTracking?.sport_fait ? '✓' : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Sport aujourd'hui</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-gray-900">{todayTracking?.kcal || '—'}</p>
              <p className="text-xs text-gray-400 mt-1">Kcal aujourd'hui</p>
            </div>
          </div>

          {/* Macros du jour */}
          {obj && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Nutrition du jour</p>
                <Link to="/athlete/tracking" className={`text-xs ${theme.textLight} font-medium`}>Saisir →</Link>
              </div>
              {todayTracking ? (
                <div className="space-y-3">
                  <MacroBar label="Protéines" val={todayTracking.proteines} target={obj.proteines} color={theme.isFemme ? 'bg-pink-500' : 'bg-brand-500'} />
                  <MacroBar label="Glucides" val={todayTracking.glucides} target={obj.glucides} color="bg-green-500" />
                  <MacroBar label="Lipides" val={todayTracking.lipides} target={obj.lipides} color="bg-orange-400" />
                </div>
              ) : (
                <p className="text-xs text-gray-400">Aucune donnée saisie aujourd'hui</p>
              )}
            </div>
          )}

          {/* Séances de la semaine */}
          {seances.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Semaine {activeSemaine?.numero}</p>
                <Link to="/athlete/seances" className={`text-xs ${theme.textLight} font-medium`}>Voir tout →</Link>
              </div>
              <div className="space-y-2">
                {seances.filter(s => s.nom !== 'Bonus').map(sc => {
                  const total = sc.exercices?.length || 0
                  const done = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
                  const complete = done >= total && total > 0
                  return (
                    <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${complete ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                      <span className={`text-sm ${complete ? 'text-green-700 line-through' : 'text-gray-700'}`}>{sc.nom}</span>
                      <span className={`text-xs ${complete ? 'text-green-600' : 'text-gray-400'}`}>
                        {complete ? '✓' : `${done}/${total}`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-3">
            <Link to="/athlete/seances" className={`bg-white border border-gray-100 rounded-xl p-4 text-center hover:border-gray-200 hover:shadow-sm transition-all`}>
              <p className="text-2xl mb-1">🏋️</p>
              <p className="text-sm font-medium text-gray-700">Mes séances</p>
            </Link>
            <Link to="/athlete/tracking" className={`bg-white border border-gray-100 rounded-xl p-4 text-center hover:border-gray-200 hover:shadow-sm transition-all`}>
              <p className="text-2xl mb-1">📊</p>
              <p className="text-sm font-medium text-gray-700">Mon suivi</p>
            </Link>
            <Link to="/athlete/progression" className={`bg-white border border-gray-100 rounded-xl p-4 text-center hover:border-gray-200 hover:shadow-sm transition-all`}>
              <p className="text-2xl mb-1">📈</p>
              <p className="text-sm font-medium text-gray-700">Progression</p>
            </Link>
            <Link to="/athlete/blocs" className={`bg-white border border-gray-100 rounded-xl p-4 text-center hover:border-gray-200 hover:shadow-sm transition-all`}>
              <p className="text-2xl mb-1">📁</p>
              <p className="text-sm font-medium text-gray-700">Mes blocs</p>
            </Link>
          </div>
        </div>
      )}
    </Layout>
  )
}
