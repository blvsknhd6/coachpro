import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function AthleteDashboard() {
  const { profile } = useAuth()
  const [blocs, setBlocs]       = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [semaines, setSemaines] = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]   = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchBlocs() }, [profile])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBlocs() {
    if (!profile) return
    const { data } = await supabase
      .from('blocs')
      .select('*')
      .eq('athlete_id', profile.id)
      .order('created_at', { ascending: false })
    setBlocs(data || [])
    if (data && data.length > 0) {
      setActiveBloc(data[0])
      fetchSemaines(data[0].id)
    } else setLoading(false)
  }

  async function fetchSemaines(blocId) {
    const { data } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(data || [])
    if (data && data.length > 0) {
      setActiveSemaine(data[data.length - 1]) // Dernière semaine par défaut
    } else setLoading(false)
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    const { data } = await supabase
      .from('seances')
      .select('*, exercices(*, series_realisees(id)), activites_bonus(*, activites_realisees(id))')
      .eq('semaine_id', semaineId)
      .order('ordre')
    setSeances(data || [])
    setLoading(false)
  }

  function handleBlocChange(bloc) {
    setActiveBloc(bloc)
    setSemaines([])
    setSeances([])
    setLoading(true)
    fetchSemaines(bloc.id)
  }

  function handleSemaineChange(sem) {
    setActiveSemaine(sem)
  }

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Mes séances</h1>

      {/* Sélecteur de blocs */}
      {blocs.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {blocs.map(b => (
            <button key={b.id} onClick={() => handleBlocChange(b)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Sélecteur de semaines */}
      {semaines.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {semaines.map(s => (
            <button key={s.id} onClick={() => handleSemaineChange(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              Semaine {s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : seances.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Ton coach n'a pas encore créé de programme.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => {
            const totalEx = seance.exercices?.length || 0
            const doneEx = seance.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
            const pct = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0

            return (
              <Link
                key={seance.id}
                to={`/athlete/seance/${seance.id}/semaine/${activeSemaine?.id}`}
                className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group"
              >
                <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 mb-3">{seance.nom}</p>
                <p className="text-xs text-gray-400 mb-2">{totalEx} exercice{totalEx !== 1 ? 's' : ''}</p>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{pct}% complété</p>
              </Link>
            )
          })}

          {/* Bonus */}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <Link
              key={seance.id}
              to={`/athlete/seance/${seance.id}/semaine/${activeSemaine?.id}`}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group"
            >
              <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 mb-1">Activités bonus</p>
              <p className="text-xs text-gray-400">
                {seance.activites_bonus?.filter(a => a.activites_realisees?.length > 0).length || 0}
                /{seance.activites_bonus?.length || 0} réalisées
              </p>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
