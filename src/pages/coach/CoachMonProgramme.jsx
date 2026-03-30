import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import ProgressionPanel from '../../components/shared/ProgressionPanel'
import { loadPreferences, savePreferences, DEFAULT_PROGRESSION_CONFIG } from '../../lib/preferences'

export default function CoachMonProgramme() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [selfProfile, setSelfProfile] = useState(null)
  const [blocs, setBlocs] = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [semaines, setSemaines] = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewBloc, setShowNewBloc] = useState(false)
  const [newBlocName, setNewBlocName] = useState('')
  const [progConfig, setProgConfig] = useState(DEFAULT_PROGRESSION_CONFIG)
  const [tab, setTab] = useState('seances') // 'seances' | 'progression'

  useEffect(() => { if (profile) init() }, [profile])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function init() {
    const [selfRes, prefs] = await Promise.all([
      supabase.from('profiles').select('*').eq('coach_id', profile.id).eq('is_self', true).single(),
      loadPreferences(profile.id)
    ])

    if (prefs?.progression_config) setProgConfig({ ...DEFAULT_PROGRESSION_CONFIG, ...prefs.progression_config })

    if (selfRes.data) {
      setSelfProfile(selfRes.data)
      fetchBlocs(selfRes.data.id)
    } else {
      // Propose creation
      setLoading(false)
    }
  }

  async function createSelfProfile() {
    const { data } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(), role: 'athlete', full_name: profile.full_name,
      email: profile.email, genre: profile.genre || 'homme', coach_id: profile.id, is_self: true,
    }).select().single()
    if (data) { setSelfProfile(data); fetchBlocs(data.id) }
  }

  async function fetchBlocs(athleteId) {
    const { data } = await supabase.from('blocs').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false })
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
        const { data: sr } = await supabase.from('series_realisees').select('id').eq('athlete_id', selfProfile?.id).in('exercice_id', scIds.map(s => s.id)).limit(1)
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

  async function createBloc() {
    if (!newBlocName.trim() || !selfProfile) return
    const { data } = await supabase.from('blocs').insert({ athlete_id: selfProfile.id, name: newBlocName.trim() }).select().single()
    setBlocs(b => [data, ...b]); setActiveBloc(data); setNewBlocName(''); setShowNewBloc(false)
    navigate(`/coach/bloc/${data.id}/edit`)
  }

  async function handleProgConfigChange(cfg) {
    setProgConfig(cfg)
    await savePreferences(profile.id, { progression_config: cfg })
  }

  if (!selfProfile) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-16">
          <h1 className="text-xl font-semibold mb-2">Mon entraînement</h1>
          <p className="text-sm text-gray-500 mb-6">Crée ton profil personnel pour suivre ton propre entraînement.</p>
          <button onClick={createSelfProfile} className="bg-brand-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-brand-700">
            Créer mon profil athlète
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Mon entraînement</h1>
        <button onClick={() => setShowNewBloc(true)} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700">+ Bloc</button>
      </div>

      {showNewBloc && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold mb-4">Nouveau bloc</h2>
            <input autoFocus value={newBlocName} onChange={e => setNewBlocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createBloc()} placeholder="Nom du bloc..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={createBloc} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm">Créer et éditer</button>
              <button onClick={() => setShowNewBloc(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[['seances','Séances'],['progression','Progression']].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Blocs + semaines */}
      {blocs.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {blocs.map(b => (
            <div key={b.id} className="flex items-center gap-0">
              <button onClick={() => { setActiveBloc(b); fetchSemaines(b.id) }}
                className={`px-3 py-1.5 rounded-l-lg text-sm transition-colors ${activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {b.name}
              </button>
              <Link to={`/coach/bloc/${b.id}/edit`}
                className={`px-2 py-1.5 rounded-r-lg text-xs border-t border-b border-r transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 border-brand-700' : 'bg-white border-gray-200 text-gray-400 hover:text-brand-500'}`}>
                ✎
              </Link>
            </div>
          ))}
        </div>
      )}

      {tab === 'seances' && (
        <>
          {semaines.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {semaines.map(s => (
                <button key={s.id} onClick={() => setActiveSemaine(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                  S{s.numero}
                </button>
              ))}
            </div>
          )}

          {loading ? <p className="text-sm text-gray-400">Chargement...</p> : blocs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 mb-4">Aucun bloc. Crée ton premier programme.</p>
              <button onClick={() => setShowNewBloc(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm">Créer un bloc</button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {seances.filter(s => s.nom !== 'Bonus').map(sc => {
                const total = sc.exercices?.length || 0
                const done = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                return (
                  <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                    className="bg-white border border-gray-100 rounded-xl p-4 hover:border-brand-200 hover:shadow-sm transition-all group">
                    <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 mb-2">{sc.nom}</p>
                    <p className="text-xs text-gray-400 mb-2">{total} exercices</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{pct}%</p>
                  </Link>
                )
              })}
              {seances.filter(s => s.nom === 'Bonus').map(sc => {
                const doneBon = sc.activites_bonus?.filter(a => (a.activites_realisees || []).some(r => r.realisee)).map(a => a.nom) || []
                return (
                  <div key={sc.id} className="bg-white border border-gray-100 rounded-xl p-4">
                    <p className="font-medium text-sm text-gray-900 mb-2">Activités bonus</p>
                    {doneBon.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {doneBon.map(nom => (
                          <span key={nom} className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">✓ {nom}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Aucune réalisée</p>
                    )}
                    <Link to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`} className="mt-2 block text-xs text-brand-600 font-medium">Voir / ajouter</Link>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'progression' && selfProfile && (
        <ProgressionPanel
          athleteId={selfProfile.id}
          config={progConfig}
          onConfigChange={handleProgConfigChange}
          color="#6366f1"
        />
      )}
    </Layout>
  )
}
