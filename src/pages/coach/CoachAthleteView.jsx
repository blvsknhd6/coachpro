import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import { findActiveSemaine } from '../../lib/semaine'

export default function CoachAthleteView() {
  const { athleteId } = useParams()
  const navigate = useNavigate()
  const [athlete, setAthlete]         = useState(null)
  const [blocs, setBlocs]             = useState([])
  const [activeBloc, setActiveBloc]   = useState(null)
  const [semaines, setSemaines]       = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [showExport, setShowExport]   = useState(false)
  const [exportText, setExportText]   = useState('')

  useEffect(() => { fetchData() }, [athleteId])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchData() {
    const { data: ath } = await supabase.from('profiles').select('*').eq('id', athleteId).single()
    setAthlete(ath)
    const { data: bl } = await supabase
      .from('blocs')
      .select('*, objectifs_bloc(*)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
    setBlocs(bl || [])
    if (bl?.[0]) { setActiveBloc(bl[0]); fetchSemaines(bl[0].id) }
    else setLoading(false)
  }

  async function fetchSemaines(blocId) {
    const { data } = await supabase
      .from('semaines')
      .select('*')
      .eq('bloc_id', blocId)
      .order('numero')
    setSemaines(data || [])
    if (data?.length) {
      const active = await findActiveSemaine(data, athleteId)
      setActiveSemaine(active)
    } else {
      setLoading(false)
    }
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    // On sélectionne semaine_id dans activites_realisees pour pouvoir filtrer ensuite
    const { data } = await supabase
      .from('seances')
      .select('*, exercices(*, series_realisees(*)), activites_bonus(*, activites_realisees(id, athlete_id, semaine_id, realisee))')
      .eq('semaine_id', semaineId)
      .order('ordre')
    setSeances(data || [])
    setLoading(false)
  }

  async function generateExport() {
    let text = `=== COMPTE RENDU ${athlete?.full_name} — ${activeBloc?.name} — Semaine ${activeSemaine?.numero} ===\n\n`
    for (const sc of seances.filter(s => s.nom !== 'Bonus')) {
      text += `## ${sc.nom}\n`
      const note = await supabase.from('notes_seances').select('contenu')
        .eq('athlete_id', athleteId).eq('seance_id', sc.id).eq('semaine_id', activeSemaine.id).single()
      if (note.data?.contenu) text += `Note globale : ${note.data.contenu}\n`
      for (const ex of (sc.exercices || []).sort((a, b) => a.ordre - b.ordre)) {
        const series = (ex.series_realisees || []).sort((a, b) => a.numero_set - b.numero_set)
        if (series.length === 0) { text += `  ${ex.nom} : non réalisé\n`; continue }
        const sStr = series
          .map(s => `${s.charge || '?'}kg×${s.reps || '?'}${s.notes ? ` (${s.notes})` : ''}`)
          .join(' | ')
        text += `  ${ex.nom} (${ex.sets}×${ex.rep_range}) : ${sStr}\n`
      }
      text += '\n'
    }
    const bonus = seances.find(s => s.nom === 'Bonus')
    if (bonus) {
      const done = (bonus.activites_bonus || []).filter(a =>
        (a.activites_realisees || []).some(r => r.realisee && r.semaine_id === activeSemaine.id)
      )
      if (done.length) text += `## Bonus réalisés\n${done.map(a => `  ✓ ${a.nom}`).join('\n')}\n\n`
    }
    // Tracking — filtré par les 7 derniers jours du bloc courant
    const { data: tracking } = await supabase
      .from('data_tracking')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('bloc_id', activeBloc.id)
      .order('date', { ascending: false })
      .limit(7)
    if (tracking?.length) {
      text += `## Nutrition (moyennes)\n`
      const avg = (key) => {
        const vals = tracking.map(t => t[key]).filter(v => v != null)
        return vals.length ? Math.round(vals.reduce((a, b) => a + Number(b), 0) / vals.length) : '—'
      }
      text += `  Kcal: ${avg('kcal')} | Prot: ${avg('proteines')}g | Gluc: ${avg('glucides')}g | Lip: ${avg('lipides')}g\n`
      text += `  Sommeil: ${avg('sommeil')}h | Pas: ${avg('pas_journaliers')}/j | Stress: ${avg('stress')}/10\n`
    }
    setExportText(text)
    setShowExport(true)
  }

  const isFemme = athlete?.genre === 'femme'
  const obj = Array.isArray(activeBloc?.objectifs_bloc) ? activeBloc?.objectifs_bloc[0] : activeBloc?.objectifs_bloc
  const planLabel = { prise_de_masse: '💪 Prise de masse', maintien: '⚖️ Maintien', seche: '🔥 Sèche' }

  return (
    <Layout>
      {showExport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] flex flex-col">
            <h3 className="text-base font-semibold mb-2">Export — copie et colle dans ton IA</h3>
            <textarea readOnly value={exportText}
              className="flex-1 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-700 resize-none min-h-64"
              onClick={e => e.target.select()}
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => navigator.clipboard.writeText(exportText)}
                className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700">
                Copier
              </button>
              <button onClick={() => setShowExport(false)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Fermer</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link to={`/coach/athlete/${athleteId}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <div className="flex items-center gap-2 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${isFemme ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
            {athlete?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <h1 className="text-lg font-semibold">{athlete?.full_name}</h1>
        </div>
        <button onClick={generateExport}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 transition-colors">
          📋 Exporter pour IA
        </button>
      </div>

      {obj?.plan_nutritionnel && (
        <div className="mb-4 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2 text-sm text-gray-700">
          {planLabel[obj.plan_nutritionnel]}
        </div>
      )}

      {blocs.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {blocs.map(b => (
            <button key={b.id}
              onClick={() => { setActiveBloc(b); setSeances([]); fetchSemaines(b.id) }}
              className={`px-3 py-1.5 rounded-lg text-sm ${activeBloc?.id === b.id ? `${isFemme ? 'bg-pink-600' : 'bg-brand-600'} text-white` : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}
      {semaines.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {semaines.map(s => (
            <button key={s.id} onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-lg text-sm ${activeSemaine?.id === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              S{s.numero}
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-4">
          {seances.filter(s => s.nom !== 'Bonus').map(sc => (
            <SeanceCard key={sc.id} seance={sc}
              semaineId={activeSemaine?.id}
              athleteId={athleteId}
              isFemme={isFemme}
              navigate={navigate}
            />
          ))}
          {seances.filter(s => s.nom === 'Bonus').map(sc => (
            <BonusCard key={sc.id} seance={sc}
              semaineId={activeSemaine?.id}
              isFemme={isFemme}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}

function SeanceCard({ seance, semaineId, athleteId, isFemme, navigate }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  const totalEx = seance.exercices?.length || 0
  const doneEx  = seance.exercices?.filter(e => (e.series_realisees || []).some(s => s.reps || s.charge)).length || 0
  const pct = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0

  useEffect(() => {
    supabase.from('notes_seances').select('contenu')
      .eq('athlete_id', athleteId).eq('seance_id', seance.id).eq('semaine_id', semaineId)
      .single()
      .then(({ data }) => { if (data) setNote(data.contenu || '') })
  }, [seance.id, semaineId])

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="flex-1 text-left">
          <p className="font-medium text-sm text-gray-900">{seance.nom}</p>
          <p className="text-xs text-gray-400 mt-0.5">{totalEx} exercices · {pct}% complété</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-48">
            <div className={`h-full ${isFemme ? 'bg-pink-500' : 'bg-brand-500'} rounded-full`} style={{ width: `${pct}%` }} />
          </div>
        </button>
        <button
          onClick={() => navigate(`/athlete/seance/${seance.id}/semaine/${semaineId}`)}
          className={`ml-4 px-3 py-1.5 rounded-lg text-xs font-medium border flex-shrink-0 ${isFemme ? 'border-pink-200 text-pink-600 hover:bg-pink-50' : 'border-brand-200 text-brand-600 hover:bg-brand-50'}`}>
          Éditer ✎
        </button>
      </div>
      {open && (
        <div className="border-t border-gray-50 px-5 pb-4 pt-3 space-y-3">
          {note && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 italic">💬 {note}</div>
          )}
          {(seance.exercices || []).sort((a, b) => a.ordre - b.ordre).map(ex => {
            const seriesDone = (ex.series_realisees || []).sort((a, b) => a.numero_set - b.numero_set)
            return (
              <div key={ex.id}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-800">{ex.nom}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    seriesDone.length >= ex.sets ? 'bg-green-50 text-green-700'
                    : seriesDone.length > 0 ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-50 text-gray-400'
                  }`}>{seriesDone.length}/{ex.sets}</span>
                </div>
                <p className="text-xs text-gray-400 mb-1">{ex.muscle} · {ex.sets}×{ex.rep_range} · repos {ex.repos}</p>
                {ex.indications && <p className="text-xs text-amber-600 mb-1">{ex.indications}</p>}
                {seriesDone.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {seriesDone.map(s => (
                      <span key={s.id} className={`text-xs px-2 py-0.5 rounded-md border ${isFemme ? 'bg-pink-50 border-pink-100 text-pink-700' : 'bg-brand-50 border-brand-100 text-brand-700'}`}>
                        S{s.numero_set} : {s.charge ? `${s.charge}kg` : '—'} × {s.reps || '—'}{s.notes ? ` · ${s.notes}` : ''}
                      </span>
                    ))}
                  </div>
                ) : (
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

function BonusCard({ seance, semaineId, isFemme, navigate }) {
  const activites = seance.activites_bonus || []
  // Fix: filtre par semaine_id (maintenant présent dans la query parente)
  const done = activites.filter(a =>
    (a.activites_realisees || []).some(r => r.realisee && r.semaine_id === semaineId)
  )

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-800">Activités bonus</h3>
        <button
          onClick={() => navigate(`/athlete/seance/${seance.id}/semaine/${semaineId}`)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${isFemme ? 'border-pink-200 text-pink-600 hover:bg-pink-50' : 'border-brand-200 text-brand-600 hover:bg-brand-50'}`}>
          Éditer ✎
        </button>
      </div>
      {done.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {done.map(a => (
            <span key={a.id} className={`text-xs px-3 py-1.5 rounded-full font-medium ${isFemme ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
              ✓ {a.nom}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Aucune activité réalisée cette semaine</p>
      )}
    </div>
  )
}
