import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'

export default function CoachAthleteView() {
  const { athleteId, semaineId } = useParams()
  const [athlete, setAthlete]     = useState(null)
  const [seances, setSeances]     = useState([])
  const [semaines, setSemaines]   = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [blocs, setBlocs]         = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [activeSeance, setActiveSeance] = useState(null)
  const [seanceData, setSeanceData] = useState(null)

  useEffect(() => { fetchData() }, [athleteId])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchData() {
    const { data: ath } = await supabase.from('profiles').select('*').eq('id', athleteId).single()
    setAthlete(ath)
    const { data: bl } = await supabase.from('blocs').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false })
    setBlocs(bl || [])
    if (bl && bl.length > 0) {
      setActiveBloc(bl[0])
      fetchSemaines(bl[0].id)
    } else setLoading(false)
  }

  async function fetchSemaines(blocId) {
    const { data } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(data || [])
    if (data && data.length > 0) setActiveSemaine(data[data.length - 1])
    else setLoading(false)
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    const { data } = await supabase
      .from('seances')
      .select('*, exercices(*, series_realisees(*)), activites_bonus(*, activites_realisees(*))')
      .eq('semaine_id', semaineId)
      .order('ordre')
    setSeances(data || [])
    setActiveSeance(null)
    setLoading(false)
  }

  const isFemme = athlete?.genre === 'femme'
  const accent = isFemme ? 'pink' : 'brand'

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/coach/athlete/${athleteId}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${isFemme ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
            {athlete?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <h1 className="text-xl font-semibold">Vue de {athlete?.full_name}</h1>
            <p className="text-xs text-gray-400">Tel que vu par le coaché</p>
          </div>
        </div>
      </div>

      {/* Sélecteur blocs */}
      {blocs.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {blocs.map(b => (
            <button key={b.id} onClick={() => { setActiveBloc(b); fetchSemaines(b.id) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeBloc?.id === b.id ? `${isFemme ? 'bg-pink-600' : 'bg-brand-600'} text-white` : 'bg-white border border-gray-200 text-gray-600'}`}>
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
              Semaine {s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-4">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => (
            <SeanceReadOnly key={seance.id} seance={seance} athleteId={athleteId} isFemme={isFemme} />
          ))}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <BonusReadOnly key={seance.id} seance={seance} athleteId={athleteId} isFemme={isFemme} />
          ))}
        </div>
      )}
    </Layout>
  )
}

function SeanceReadOnly({ seance, athleteId, isFemme }) {
  const [open, setOpen] = useState(false)
  const totalEx = seance.exercices?.length || 0
  const doneEx  = seance.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
  const pct = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0
  const progressColor = isFemme ? 'bg-pink-500' : 'bg-brand-500'

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="text-left">
          <p className="font-medium text-sm text-gray-900">{seance.nom}</p>
          <p className="text-xs text-gray-400 mt-0.5">{totalEx} exercices · {pct}% complété</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${progressColor} rounded-full`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-50 px-5 pb-4 pt-3 space-y-3">
          {(seance.exercices || []).sort((a, b) => a.ordre - b.ordre).map(ex => {
            const seriesDone = ex.series_realisees || []
            return (
              <div key={ex.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{ex.nom}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    seriesDone.length >= ex.sets ? 'bg-green-50 text-green-700'
                    : seriesDone.length > 0 ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-50 text-gray-400'
                  }`}>
                    {seriesDone.length}/{ex.sets}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{ex.muscle} · {ex.sets}×{ex.rep_range} · repos {ex.repos}</p>
                {seriesDone.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {seriesDone.sort((a, b) => a.numero_set - b.numero_set).map(s => (
                      <span key={s.id} className={`text-xs px-2 py-1 rounded-lg font-medium ${isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700'}`}>
                        Set {s.numero_set} : {s.charge ? `${s.charge}kg` : '—'} × {s.reps || '—'} reps
                        {s.notes ? ` · ${s.notes}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {seriesDone.length === 0 && (
                  <p className="text-xs text-gray-300 italic">Pas encore réalisé</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BonusReadOnly({ seance, isFemme }) {
  const activites = seance.activites_bonus || []
  const doneCount = activites.filter(a => (a.activites_realisees || []).some(r => r.realisee)).length

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-800">Activités bonus</h3>
        <span className="text-xs text-gray-400">{doneCount}/{activites.length} réalisées</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {activites.sort((a, b) => a.ordre - b.ordre).map(act => {
          const done = (act.activites_realisees || []).some(r => r.realisee)
          return (
            <span key={act.id} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              done
                ? isFemme ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {done ? '✓ ' : ''}{act.nom}
            </span>
          )
        })}
      </div>
    </div>
  )
}
