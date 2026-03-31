import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import { findActiveSemaine } from '../../lib/semaine'

export default function CoachMyTraining() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [blocs, setBlocs]               = useState([])
  const [activeBloc, setActiveBloc]     = useState(null)
  const [semaines, setSemaines]         = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [showNewBloc, setShowNewBloc]   = useState(false)
  const [newBlocName, setNewBlocName]   = useState('')
  const [savingBloc, setSavingBloc]     = useState(false)

  useEffect(() => { if (profile) fetchBlocs() }, [profile])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBlocs() {
    const { data, error } = await supabase
      .from('blocs')
      .select('*')
      .eq('athlete_id', profile.id)
      .order('created_at', { ascending: false })
    if (error) { console.error('fetchBlocs:', error); setLoading(false); return }
    setBlocs(data || [])
    if (data?.length) {
      setActiveBloc(data[0])
      fetchSemaines(data[0].id)
    } else {
      setLoading(false)
    }
  }

  async function fetchSemaines(blocId) {
    const { data, error } = await supabase
      .from('semaines')
      .select('*')
      .eq('bloc_id', blocId)
      .order('numero')
    if (error) { console.error('fetchSemaines:', error); setLoading(false); return }
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
    const { data, error } = await supabase
      .from('seances')
      .select('*, exercices(*, series_realisees(id, athlete_id)), activites_bonus(*, activites_realisees(id, athlete_id))')
      .eq('semaine_id', semaineId)
      .order('ordre')
    if (error) { console.error('fetchSeances:', error); setLoading(false); return }
    const filtered = (data || []).map(sc => ({
      ...sc,
      exercices: (sc.exercices || []).map(ex => ({
        ...ex,
        series_realisees: (ex.series_realisees || []).filter(s => s.athlete_id === profile.id)
      })),
      activites_bonus: (sc.activites_bonus || []).map(act => ({
        ...act,
        activites_realisees: (act.activites_realisees || []).filter(r => r.athlete_id === profile.id)
      }))
    }))
    setSeances(filtered)
    setLoading(false)
  }

  async function createBloc() {
    if (!newBlocName.trim()) return
    setSavingBloc(true)
    const { data, error } = await supabase
      .from('blocs')
      .insert({ athlete_id: profile.id, name: newBlocName.trim() })
      .select()
      .single()
    if (error) { console.error('createBloc:', error); setSavingBloc(false); return }
    setBlocs(b => [data, ...b])
    setActiveBloc(data)
    setSemaines([])
    setSeances([])
    setNewBlocName('')
    setShowNewBloc(false)
    setSavingBloc(false)
    navigate(`/coach/bloc/${data.id}/edit`)
  }

  function selectBloc(b) {
    setActiveBloc(b)
    setSeances([])
    setSemaines([])
    fetchSemaines(b.id).then(() => {})
    // fetchSemaines sets activeSemaine which triggers fetchSeances via useEffect
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/coach" className="text-sm text-gray-400 hover:text-gray-700">← Dashboard</Link>
        <h1 className="text-xl font-semibold flex-1">Mon entraînement</h1>
        <button onClick={() => setShowNewBloc(true)}
          className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700">
          + Nouveau bloc
        </button>
      </div>

      {showNewBloc && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold mb-4">Nouveau bloc</h2>
            <input
              autoFocus
              value={newBlocName}
              onChange={e => setNewBlocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createBloc()}
              placeholder="Nom du bloc…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={createBloc} disabled={savingBloc || !newBlocName.trim()}
                className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {savingBloc ? 'Création…' : 'Créer et éditer →'}
              </button>
              <button onClick={() => { setShowNewBloc(false); setNewBlocName('') }}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sélecteur blocs */}
      {blocs.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {blocs.map(b => (
            <div key={b.id} className="flex items-center">
              <button
                onClick={() => selectBloc(b)}
                className={`px-3 py-1.5 rounded-l-lg text-sm transition-colors ${activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                {b.name}
              </button>
              <Link
                to={`/coach/bloc/${b.id}/edit`}
                className={`px-2 py-1.5 rounded-r-lg text-xs border-t border-b border-r transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800' : 'bg-white border-gray-200 text-gray-400 hover:text-brand-500'}`}
                title="Éditer le programme">
                ✎
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Sélecteur semaines */}
      {semaines.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {semaines.map(s => (
            <button key={s.id} onClick={() => setActiveSemaine(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              S{s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : blocs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm mb-2">Aucun programme pour toi.</p>
          <p className="text-xs mb-4">Crée un bloc et configure ton programme.</p>
          <button onClick={() => setShowNewBloc(true)}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
            Créer mon premier bloc
          </button>
        </div>
      ) : seances.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <p>Ce bloc n'a pas encore de programme.</p>
          {activeBloc && (
            <Link to={`/coach/bloc/${activeBloc.id}/edit`}
              className="text-brand-600 hover:text-brand-800 font-medium mt-2 block">
              Créer le programme →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => {
            const totalEx = seance.exercices?.length || 0
            const doneEx  = seance.exercices?.filter(e => e.series_realisees?.length > 0).length || 0
            const pct = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0
            return (
              <Link
                key={seance.id}
                to={`/coach/my-training/seance/${seance.id}/semaine/${activeSemaine?.id}`}
                className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group">
                <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 mb-3">{seance.nom}</p>
                <p className="text-xs text-gray-400 mb-2">{totalEx} exercice{totalEx !== 1 ? 's' : ''}</p>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{pct}% complété</p>
              </Link>
            )
          })}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <Link
              key={seance.id}
              to={`/coach/my-training/seance/${seance.id}/semaine/${activeSemaine?.id}`}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group">
              <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 mb-1">Activités bonus</p>
              <p className="text-xs text-gray-400">
                {seance.activites_bonus?.filter(a => a.activites_realisees?.length > 0).length || 0}/{seance.activites_bonus?.length || 0} réalisées
              </p>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
