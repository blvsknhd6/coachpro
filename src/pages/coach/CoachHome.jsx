import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function CoachHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState([])
  const [myNextSeance, setMyNextSeance] = useState(null)
  const [stats, setStats] = useState({ seancesWeek: 0, actifs: 0, inactifs: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    // Athlètes
    const { data: aths } = await supabase
      .from('profiles').select('*, blocs(id, name)')
      .eq('coach_id', profile.id)
      .order('is_self', { ascending: false })
      .order('full_name')
    setAthletes(aths || [])

    // Inactivité : athlètes sans data_tracking depuis 7 jours
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const inactifs = []
    for (const ath of (aths || []).filter(a => !a.is_self)) {
      const { data: lastEntry } = await supabase.from('data_tracking').select('date')
        .eq('athlete_id', ath.id).order('date', { ascending: false }).limit(1).single()
      if (!lastEntry || new Date(lastEntry.date) < sevenDaysAgo) {
        inactifs.push({ ...ath, lastDate: lastEntry?.date || null })
      }
    }

    // Séances cette semaine (tous athlètes confondus)
    const monday = new Date()
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    monday.setHours(0, 0, 0, 0)
    const { count } = await supabase.from('data_tracking').select('id', { count: 'exact', head: true })
      .in('athlete_id', (aths || []).map(a => a.id))
      .gte('date', monday.toISOString().split('T')[0])
      .eq('sport_fait', true)

    setStats({ seancesWeek: count || 0, actifs: (aths || []).length, inactifs })

    // Ma prochaine séance (profil is_self)
    const selfProfile = (aths || []).find(a => a.is_self)
    if (selfProfile) {
      const { data: blocs } = await supabase.from('blocs').select('id').eq('athlete_id', selfProfile.id).order('created_at', { ascending: false }).limit(1)
      if (blocs?.[0]) {
        const { data: semaines } = await supabase.from('semaines').select('*').eq('bloc_id', blocs[0].id).order('numero')
        if (semaines?.length) {
          // Trouver la semaine active
          let activeSem = semaines[0]
          for (let i = semaines.length - 1; i >= 0; i--) {
            const { data: seancesIds } = await supabase.from('seances').select('id').eq('semaine_id', semaines[i].id)
            if (!seancesIds?.length) continue
            const { data: sr } = await supabase.from('series_realisees')
              .select('id').eq('athlete_id', selfProfile.id)
              .in('exercice_id', seancesIds.map(s => s.id)).limit(1)
            if (sr?.length) { activeSem = semaines[i]; break }
          }
          const { data: seances } = await supabase.from('seances')
            .select('*, exercices(*, series_realisees(id))')
            .eq('semaine_id', activeSem.id).neq('nom', 'Bonus').order('ordre')
          const incomplete = seances?.find(s => {
            const done = s.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
            return done < (s.exercices?.length || 0)
          })
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
      <div className="mb-6">
        <p className="text-sm text-gray-400 capitalize">{today}</p>
        <h1 className="text-2xl font-semibold text-gray-900">Bonjour {profile?.full_name?.split(' ')[0]} 👋</h1>
      </div>

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-6">
          {/* Mon entraînement */}
          {myNextSeance && (
            <div className="bg-brand-600 text-white rounded-2xl p-5">
              <p className="text-xs font-medium opacity-70 mb-1">Ma prochaine séance</p>
              <p className="text-lg font-semibold mb-3">{myNextSeance.seance.nom}</p>
              <button
                onClick={() => navigate(`/athlete/seance/${myNextSeance.seance.id}/semaine/${myNextSeance.semaineId}`)}
                className="bg-white text-brand-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-50 transition-colors">
                Commencer →
              </button>
            </div>
          )}

          {/* Stats rapides */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-gray-900">{stats.actifs}</p>
              <p className="text-xs text-gray-400 mt-1">Coachés</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-gray-900">{stats.seancesWeek}</p>
              <p className="text-xs text-gray-400 mt-1">Séances cette semaine</p>
            </div>
            <div className={`border rounded-xl p-4 text-center ${stats.inactifs.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
              <p className={`text-2xl font-semibold ${stats.inactifs.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{stats.inactifs.length}</p>
              <p className="text-xs text-gray-400 mt-1">Inactifs +7j</p>
            </div>
          </div>

          {/* Alertes inactivité */}
          {stats.inactifs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-medium text-amber-700 mb-2">⚠️ Pas de données depuis 7+ jours</p>
              <div className="space-y-1">
                {stats.inactifs.map(a => (
                  <Link key={a.id} to={`/coach/athlete/${a.id}`}
                    className="flex items-center justify-between py-1 hover:opacity-80">
                    <span className="text-sm text-amber-800">{a.full_name}</span>
                    <span className="text-xs text-amber-500">{a.lastDate ? `Dernier : ${new Date(a.lastDate).toLocaleDateString('fr-FR')}` : 'Jamais'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="grid grid-cols-1 gap-3">
            <Link to="/coach/athletes" className="bg-white border border-gray-100 rounded-xl p-5 flex items-center justify-between hover:border-brand-200 hover:shadow-sm transition-all group">
              <div>
                <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700">Mes coachés</p>
                <p className="text-xs text-gray-400 mt-0.5">{stats.actifs} profil{stats.actifs !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-gray-400 group-hover:text-brand-600">→</span>
            </Link>
            <Link to="/coach/mon-programme" className="bg-white border border-gray-100 rounded-xl p-5 flex items-center justify-between hover:border-brand-200 hover:shadow-sm transition-all group">
              <div>
                <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700">Mon entraînement</p>
                <p className="text-xs text-gray-400 mt-0.5">Gérer ton programme personnel</p>
              </div>
              <span className="text-gray-400 group-hover:text-brand-600">→</span>
            </Link>
          </div>

          {/* Liste coachés avec dernier statut */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Mes coachés</p>
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
                    {stats.inactifs.find(i => i.id === a.id) && (
                      <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Inactif</span>
                    )}
                    <span className="text-gray-400 text-sm">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
