import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'

export default function AthleteEntrainement() {
  const { profile } = useAuth()
  const theme = useTheme()
  const [blocs, setBlocs]           = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [semaines, setSemaines]     = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]       = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => { if (profile) fetchBlocs() }, [profile])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBlocs() {
    const { data } = await supabase.from('blocs').select('*').eq('athlete_id', profile.id).order('created_at', { ascending: false })
    setBlocs(data || [])
    if (data?.length) { setActiveBloc(data[0]); fetchSemaines(data[0].id) }
    else setLoading(false)
  }

  async function fetchSemaines(blocId) {
    const { data } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(data || [])
    if (data?.length) {
      let active = data[0]
      for (let i = data.length - 1; i >= 0; i--) {
        const { data: scIds } = await supabase.from('seances').select('id').eq('semaine_id', data[i].id)
        if (!scIds?.length) continue
        const { data: sr } = await supabase.from('series_realisees').select('id').eq('athlete_id', profile.id).in('exercice_id', scIds.map(s => s.id)).limit(1)
        if (sr?.length) { active = data[i]; break }
      }
      setActiveSemaine(active)
    } else setLoading(false)
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    const { data } = await supabase.from('seances')
      .select('*, exercices(*, series_realisees(id)), activites_bonus(*, activites_realisees(id))')
      .eq('semaine_id', semaineId).order('ordre')
    setSeances(data || [])
    setLoading(false)
  }

  // Toggle activité bonus directement
  async function toggleActivite(activiteId, current, activiteSeanceId) {
    const newVal = !current
    setSeances(prev => prev.map(sc => ({
      ...sc,
      activites_bonus: (sc.activites_bonus || []).map(a => a.id === activiteId ? {
        ...a,
        activites_realisees: newVal ? [{ realisee: true }] : []
      } : a)
    })))
    await supabase.from('activites_realisees').upsert({
      activite_id: activiteId, semaine_id: activeSemaine.id, athlete_id: profile.id, realisee: newVal
    }, { onConflict: 'activite_id,semaine_id,athlete_id' })
  }

  const accentBg = theme.isFemme ? 'bg-pink-600' : 'bg-brand-600'
  const accentText = theme.isFemme ? 'text-pink-600' : 'text-brand-600'
  const accentProgress = theme.isFemme ? 'bg-pink-500' : 'bg-brand-500'
  const accentBorder = theme.isFemme ? 'hover:border-pink-200' : 'hover:border-brand-200'

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-4">Mon entraînement</h1>

      {blocs.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {blocs.map(b => (
            <button key={b.id} onClick={() => { setActiveBloc(b); fetchSemaines(b.id) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeBloc?.id === b.id ? `${accentBg} text-white` : 'bg-white border border-gray-200 text-gray-600'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {semaines.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {semaines.map(s => (
            <button key={s.id} onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              S{s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Chargement...</p> : seances.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Aucun programme disponible.</p>
      ) : (
        <div className="space-y-3">
          {/* Séances d'entraînement */}
          <div className="grid gap-3 sm:grid-cols-2">
            {seances.filter(s => s.nom !== 'Bonus').map(sc => {
              const total = sc.exercices?.length || 0
              const done = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              const complete = pct === 100
              return (
                <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                  className={`bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-all group ${accentBorder}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`font-medium text-sm text-gray-900 group-hover:${accentText}`}>{sc.nom}</p>
                    {complete && <span className="text-xs text-green-600 font-medium">Termine</span>}
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{total} exercices</p>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${accentProgress} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}%</p>
                </Link>
              )
            })}
          </div>

          {/* Activités bonus — inline sans clic sur section */}
          {seances.filter(s => s.nom === 'Bonus').map(sc => (
            <div key={sc.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Activités bonus</p>
                <Link to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                  className={`text-xs ${accentText} font-medium`}>
                  Ajouter / voir tout
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {(sc.activites_bonus || []).sort((a, b) => a.ordre - b.ordre).map(act => {
                  const done = (act.activites_realisees || []).some(r => r.realisee)
                  return (
                    <button key={act.id}
                      onClick={() => toggleActivite(act.id, done, sc.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        done
                          ? theme.isFemme ? 'bg-pink-100 border-pink-200 text-pink-700' : 'bg-brand-100 border-brand-200 text-brand-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        done ? (theme.isFemme ? 'bg-pink-500 border-pink-500' : 'bg-brand-500 border-brand-500') : 'border-gray-300'
                      }`}>
                        {done && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                      </span>
                      {act.nom}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
