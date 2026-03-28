import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function CoachMonProgramme() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [selfProfile, setSelfProfile] = useState(null)
  const [blocs, setBlocs]   = useState([])
  const [semaines, setSemaines] = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBloc, setActiveBloc] = useState(null)
  const [showNewBloc, setShowNewBloc] = useState(false)
  const [newBlocName, setNewBlocName] = useState('')

  useEffect(() => { if (profile) initSelf() }, [profile])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function initSelf() {
    // Vérifie si le coach a déjà un profil athlète pour lui-même
    let selfId = profile.self_athlete_id

    if (!selfId) {
      // Créer un profil athlète pour le coach
      const { data: newProfile } = await supabase.from('profiles').insert({
        id: crypto.randomUUID(),
        role: 'athlete',
        full_name: profile.full_name,
        email: profile.email,
        genre: profile.genre || 'homme',
        coach_id: profile.id,
      }).select().single()

      if (newProfile) {
        await supabase.from('profiles').update({ self_athlete_id: newProfile.id }).eq('id', profile.id)
        selfId = newProfile.id
      }
    }

    const { data: sp } = await supabase.from('profiles').select('*').eq('id', selfId).single()
    setSelfProfile(sp)
    fetchBlocs(selfId)
  }

  async function fetchBlocs(athleteId) {
    const { data } = await supabase.from('blocs').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false })
    setBlocs(data || [])
    if (data && data.length > 0) { setActiveBloc(data[0]); fetchSemaines(data[0].id) }
    else setLoading(false)
  }

  async function fetchSemaines(blocId) {
    const { data } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(data || [])
    if (data && data.length > 0) {
      // Semaine active = dernière semaine avec activité
      const activeSem = await getActiveSemaine(data)
      setActiveSemaine(activeSem)
    } else setLoading(false)
  }

  async function getActiveSemaine(semainesList) {
    for (let i = semainesList.length - 1; i >= 0; i--) {
      const sem = semainesList[i]
      const { data: seancesIds } = await supabase.from('seances').select('id').eq('semaine_id', sem.id)
      if (!seancesIds?.length) continue
      const { data: series } = await supabase.from('series_realisees')
        .select('id').in('exercice_id', seancesIds.map(s => s.id)).limit(1)
      if (series?.length) return sem
    }
    return semainesList[0]
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

  async function createBloc() {
    
    if (!newBlocName.trim()) return
    const targetId = selfProfile?.id
    if (!targetId) return
    const { data } = await supabase.from('blocs').insert({
      athlete_id: selfProfile.id,
      name: newBlocName.trim(),
    }).select().single()
    setBlocs(b => [data, ...b])
    setActiveBloc(data)
    setNewBlocName('')
    setShowNewBloc(false)
    setSemaines([])
    setSeances([])
    navigate(`/coach/bloc/${data.id}/edit`)
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Mon entraînement</h1>
        {selfProfile && (
          <button onClick={() => setShowNewBloc(true)}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
            + Nouveau bloc
          </button>
        )}
      </div>

      {showNewBloc && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold mb-4">Nouveau bloc</h2>
            <input autoFocus value={newBlocName} onChange={e => setNewBlocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createBloc()}
              placeholder="Ex: Bloc 1 - Force"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={createBloc} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700">Créer</button>
              <button onClick={() => setShowNewBloc(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Sélecteur blocs */}
      {blocs.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {blocs.map(b => (
            <button key={b.id} onClick={() => { setActiveBloc(b); fetchSemaines(b.id) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {b.name}
            </button>
          ))}
          {activeBloc && (
            <Link to={`/coach/bloc/${activeBloc.id}/edit`}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-brand-600 hover:border-brand-300 transition-colors">
              Éditer →
            </Link>
          )}
        </div>
      )}

      {/* Sélecteur semaines */}
      {semaines.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {semaines.map(s => (
            <button key={s.id} onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              Semaine {s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : blocs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-4">Aucun programme pour l'instant.</p>
          <button onClick={() => setShowNewBloc(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Créer mon premier bloc
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => {
            const totalEx = seance.exercices?.length || 0
            const doneEx  = seance.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
            const pct = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0
            return (
              <Link key={seance.id} to={`/athlete/seance/${seance.id}/semaine/${activeSemaine?.id}`}
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
            <Link key={seance.id} to={`/athlete/seance/${seance.id}/semaine/${activeSemaine?.id}`}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group">
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
