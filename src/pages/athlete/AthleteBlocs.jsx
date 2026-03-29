import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'

export default function AthleteBlocs() {
  const { profile } = useAuth()
  const theme = useTheme()
  const [blocs, setBlocs] = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [semaines, setSemaines] = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)

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
      // Semaine active
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

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/athlete" className="text-sm text-gray-400 hover:text-gray-700">← Accueil</Link>
        <h1 className="text-xl font-semibold">Mes blocs</h1>
      </div>

      {/* Sélecteur blocs */}
      {blocs.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {blocs.map(b => (
            <button key={b.id} onClick={() => { setActiveBloc(b); fetchSemaines(b.id) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeBloc?.id === b.id ? `${theme.bg} text-white` : 'bg-white border border-gray-200 text-gray-600'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Sélecteur semaines */}
      {semaines.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {semaines.map(s => (
            <button key={s.id} onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              S{s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : seances.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">Aucun programme disponible.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {seances.filter(s => s.nom !== 'Bonus').map(sc => {
            const total = sc.exercices?.length || 0
            const done = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-all group">
                <p className={`font-medium text-sm text-gray-900 group-hover:${theme.text} mb-3`}>{sc.nom}</p>
                <p className="text-xs text-gray-400 mb-2">{total} exercice{total !== 1 ? 's' : ''}</p>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${theme.progress} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{pct}% complété</p>
              </Link>
            )
          })}
          {seances.filter(s => s.nom === 'Bonus').map(sc => (
            <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-all group">
              <p className={`font-medium text-sm text-gray-900 group-hover:${theme.text} mb-1`}>Activités bonus</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {sc.activites_bonus?.filter(a => (a.activites_realisees || []).some(r => r.realisee)).map(a => (
                  <span key={a.id} className={`text-xs px-2 py-0.5 rounded-full ${theme.isFemme ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                    ✓ {a.nom}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
