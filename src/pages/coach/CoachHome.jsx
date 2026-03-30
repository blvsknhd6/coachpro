import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import WidgetConfig from '../../components/shared/WidgetConfig'

export default function CoachHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { isWidgetEnabled } = usePreferences()
  const [showConfig, setShowConfig] = useState(false)
  const [athletes, setAthletes] = useState([])
  const [myNextSeance, setMyNextSeance] = useState(null)
  const [stats, setStats] = useState({ seancesWeek: 0, actifs: 0, inactifs: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    const { data: aths } = await supabase.from('profiles').select('id, full_name, genre, is_self, blocs(id)')
      .eq('coach_id', profile.id).order('is_self', { ascending: false }).order('full_name')
    setAthletes(aths || [])

    // Stats semaine
    const monday = new Date()
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    monday.setHours(0,0,0,0)
    const { count } = await supabase.from('data_tracking').select('id', { count: 'exact', head: true })
      .in('athlete_id', (aths || []).map(a => a.id))
      .gte('date', monday.toISOString().split('T')[0]).eq('sport_fait', true)

    // Inactifs
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const inactifs = []
    for (const ath of (aths || []).filter(a => !a.is_self)) {
      const { data: last } = await supabase.from('data_tracking').select('date').eq('athlete_id', ath.id).order('date', { ascending: false }).limit(1).single()
      if (!last || new Date(last.date) < sevenDaysAgo) inactifs.push({ ...ath, lastDate: last?.date || null })
    }
    setStats({ seancesWeek: count || 0, actifs: (aths || []).filter(a => !a.is_self).length, inactifs })

    // Ma prochaine séance
    const selfProfile = (aths || []).find(a => a.is_self)
    if (selfProfile) {
      const { data: blocs } = await supabase.from('blocs').select('id').eq('athlete_id', selfProfile.id).order('created_at', { ascending: false }).limit(1)
      if (blocs?.[0]) {
        const { data: semaines } = await supabase.from('semaines').select('id, numero').eq('bloc_id', blocs[0].id).order('numero')
        if (semaines?.length) {
          let activeSem = semaines[0]
          for (let i = semaines.length - 1; i >= 0; i--) {
            const { data: scIds } = await supabase.from('seances').select('id').eq('semaine_id', semaines[i].id)
            if (!scIds?.length) continue
            const { count: c } = await supabase.from('series_realisees').select('id', { count: 'exact', head: true }).eq('athlete_id', selfProfile.id).in('exercice_id', scIds.map(s => s.id))
            if (c > 0) { activeSem = semaines[i]; break }
          }
          const { data: sc } = await supabase.from('seances').select('id, nom, exercices(id, series_realisees(id))').eq('semaine_id', activeSem.id).neq('nom', 'Bonus').order('ordre')
          const incomplete = (sc || []).find(s => (s.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0) < (s.exercices?.length || 0))
          if (incomplete) setMyNextSeance({ seance: incomplete, semaineId: activeSem.id })
        }
      }
    }
    setLoading(false)
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Layout>
      {showConfig && <WidgetConfig onClose={() => setShowConfig(false)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 capitalize">{today}</p>
          <h1 className="text-xl font-semibold text-gray-900">Bonjour {profile?.full_name?.split(' ')[0]}</h1>
        </div>
        <button onClick={() => setShowConfig(true)} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5">
          Widgets
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {isWidgetEnabled('next_seance') && myNextSeance && (
            <div className="bg-brand-600 text-white rounded-2xl p-4">
              <p className="text-xs font-medium opacity-70 mb-0.5">Ma prochaine séance</p>
              <p className="text-base font-semibold mb-2">{myNextSeance.seance.nom}</p>
              <button onClick={() => navigate(`/athlete/seance/${myNextSeance.seance.id}/semaine/${myNextSeance.semaineId}`)}
                className="bg-white text-brand-700 px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-90">
                Commencer
              </button>
            </div>
          )}

          {isWidgetEnabled('stats_coachés') && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-xl font-semibold text-gray-900">{stats.actifs}</p>
                <p className="text-xs text-gray-400 mt-0.5">Coachés</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-xl font-semibold text-gray-900">{stats.seancesWeek}</p>
                <p className="text-xs text-gray-400 mt-0.5">Séances semaine</p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${stats.inactifs.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
                <p className={`text-xl font-semibold ${stats.inactifs.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{stats.inactifs.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">Inactifs</p>
              </div>
            </div>
          )}

          {isWidgetEnabled('alertes') && stats.inactifs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-medium text-amber-700 mb-2">Pas de données depuis 7+ jours</p>
              {stats.inactifs.map(a => (
                <Link key={a.id} to={`/coach/athlete/${a.id}`} className="flex items-center justify-between py-1">
                  <span className="text-sm text-amber-800">{a.full_name}</span>
                  <span className="text-xs text-amber-500">{a.lastDate ? new Date(a.lastDate).toLocaleDateString('fr-FR') : 'Jamais'}</span>
                </Link>
              ))}
            </div>
          )}

          {isWidgetEnabled('liste_coachés') && (
            <div className="space-y-2">
              {athletes.filter(a => !a.is_self).map(a => (
                <Link key={a.id} to={`/coach/athlete/${a.id}`}
                  className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between hover:border-brand-200 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${a.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                      {initiales(a.full_name)}
                    </div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700">{a.full_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {stats.inactifs.find(i => i.id === a.id) && <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Inactif</span>}
                    <span className="text-gray-400 text-sm">›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
