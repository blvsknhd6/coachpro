import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'

export default function AthleteSeance() {
  const { seanceId, semaineId } = useParams()
  const { profile } = useAuth()
  const theme = useTheme()
  const [seance, setSeance]       = useState(null)
  const [exercices, setExercices] = useState([])
  const [activites, setActivites] = useState([])
  const [series, setSeries]       = useState({})
  const [seriesPrev, setSeriesPrev] = useState({}) // perfs semaine précédente
  const [activitesRealisees, setActivitesRealisees] = useState({})
  const [loading, setLoading]     = useState(true)
  const [isCoachEditing, setIsCoachEditing] = useState(false) // coach qui édite pour le coaché

  useEffect(() => { fetchAll() }, [seanceId, semaineId, profile])

  async function fetchAll() {
    if (!profile) return
    const { data: sc } = await supabase.from('seances').select('*').eq('id', seanceId).single()
    setSeance(sc)

    // Déterminer si c'est le coach qui consulte la séance d'un coaché
    // On récupère l'athlète lié à la semaine
    const { data: semaine } = await supabase.from('semaines').select('bloc_id').eq('id', semaineId).single()
    const { data: bloc } = semaine ? await supabase.from('blocs').select('athlete_id').eq('id', semaine.bloc_id).single() : { data: null }
    const athleteId = bloc?.athlete_id || profile.id
    const editingForOther = profile.role === 'coach' && athleteId !== profile.id && athleteId !== profile.self_athlete_id
    setIsCoachEditing(editingForOther)

    if (sc?.nom === 'Bonus') {
      const { data: acts } = await supabase.from('activites_bonus').select('*').eq('seance_id', seanceId).order('ordre')
      setActivites(acts || [])
      const { data: realisees } = await supabase.from('activites_realisees').select('*').eq('semaine_id', semaineId).eq('athlete_id', athleteId)
      const map = {}
      ;(realisees || []).forEach(r => { map[r.activite_id] = r.realisee })
      setActivitesRealisees(map)
      setLoading(false)
      return
    }

    const { data: exs } = await supabase.from('exercices').select('*').eq('seance_id', seanceId).order('ordre')
    setExercices(exs || [])

    // Séries de la semaine actuelle
    const { data: sr } = await supabase.from('series_realisees').select('*')
      .eq('semaine_id', semaineId).eq('athlete_id', athleteId)
      .in('exercice_id', (exs || []).map(e => e.id)).order('numero_set')
    const map = {}
    ;(exs || []).forEach(ex => { map[ex.id] = [] })
    ;(sr || []).forEach(s => { if (map[s.exercice_id]) map[s.exercice_id].push(s) })
    setSeries(map)

    // Perfs semaine précédente
    await fetchSeriesPrev(exs || [], semaineId, athleteId)

    setLoading(false)
  }

  async function fetchSeriesPrev(exs, currentSemaineId, athleteId) {
    // Trouver la semaine précédente
    const { data: semaineCourante } = await supabase.from('semaines').select('numero, bloc_id').eq('id', currentSemaineId).single()
    if (!semaineCourante || semaineCourante.numero <= 1) return

    const { data: semPrev } = await supabase.from('semaines')
      .select('id').eq('bloc_id', semaineCourante.bloc_id).eq('numero', semaineCourante.numero - 1).single()
    if (!semPrev) return

    // Trouver les séances de la semaine précédente avec le même nom
    const { data: seancePrev } = await supabase.from('seances')
      .select('id').eq('semaine_id', semPrev.id).eq('nom', seance?.nom || '').single()
    if (!seancePrev) return

    const { data: exsPrev } = await supabase.from('exercices').select('*').eq('seance_id', seancePrev.id).order('ordre')

    const { data: srPrev } = await supabase.from('series_realisees').select('*')
      .eq('semaine_id', semPrev.id).eq('athlete_id', athleteId)
      .in('exercice_id', (exsPrev || []).map(e => e.id)).order('numero_set')

    // Mapper par nom d'exercice (pas par id, car les ids changent entre semaines)
    const mapByNom = {}
    ;(exsPrev || []).forEach(ex => { mapByNom[ex.nom] = [] })
    ;(srPrev || []).forEach(s => {
      const ex = (exsPrev || []).find(e => e.id === s.exercice_id)
      if (ex && mapByNom[ex.nom]) mapByNom[ex.nom].push(s)
    })
    setSeriesPrev(mapByNom)
  }

  async function addSerie(exerciceId, numeroSet, athleteId) {
    const { data: semaine } = await supabase.from('semaines').select('bloc_id').eq('id', semaineId).single()
    const { data: bloc } = semaine ? await supabase.from('blocs').select('athlete_id').eq('id', semaine.bloc_id).single() : { data: null }
    const targetAthleteId = bloc?.athlete_id || profile.id

    const { data } = await supabase.from('series_realisees').upsert({
      exercice_id: exerciceId, semaine_id: semaineId, athlete_id: targetAthleteId,
      numero_set: numeroSet, charge: null, reps: null,
    }, { onConflict: 'exercice_id,semaine_id,athlete_id,numero_set' }).select().single()
    setSeries(prev => ({
      ...prev,
      [exerciceId]: [...(prev[exerciceId] || []).filter(s => s.numero_set !== numeroSet), data].sort((a, b) => a.numero_set - b.numero_set)
    }))
  }

  async function updateSerie(serieId, exerciceId, field, value) {
    await supabase.from('series_realisees').update({ [field]: value === '' ? null : value }).eq('id', serieId)
    setSeries(prev => ({ ...prev, [exerciceId]: prev[exerciceId].map(s => s.id === serieId ? { ...s, [field]: value } : s) }))
  }

  async function deleteSerie(serieId, exerciceId) {
    await supabase.from('series_realisees').delete().eq('id', serieId)
    setSeries(prev => ({ ...prev, [exerciceId]: prev[exerciceId].filter(s => s.id !== serieId) }))
  }

  async function toggleActivite(activiteId, current) {
    const { data: semaine } = await supabase.from('semaines').select('bloc_id').eq('id', semaineId).single()
    const { data: bloc } = semaine ? await supabase.from('blocs').select('athlete_id').eq('id', semaine.bloc_id).single() : { data: null }
    const targetAthleteId = bloc?.athlete_id || profile.id

    const newVal = !current
    setActivitesRealisees(prev => ({ ...prev, [activiteId]: newVal }))
    await supabase.from('activites_realisees').upsert({
      activite_id: activiteId, semaine_id: semaineId, athlete_id: targetAthleteId, realisee: newVal,
    }, { onConflict: 'activite_id,semaine_id,athlete_id' })
  }

  if (loading) return <Layout><p className="text-sm text-gray-400">Chargement…</p></Layout>

  if (seance?.nom === 'Bonus') {
    const doneCount = activites.filter(a => activitesRealisees[a.id]).length
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-4">
          <Link to={profile?.role === 'coach' ? -1 : '/athlete'} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-semibold">Activités bonus</h1>
          {isCoachEditing && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Mode édition coach</span>}
        </div>
        <p className="text-sm text-gray-400 mb-4">{doneCount}/{activites.length} réalisées</p>
        <div className="space-y-2">
          {activites.map(act => {
            const done = !!activitesRealisees[act.id]
            return (
              <button key={act.id} onClick={() => toggleActivite(act.id, done)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                  done
                    ? theme.isFemme ? 'bg-pink-50 border-pink-200 text-pink-800' : 'bg-brand-50 border-brand-200 text-brand-800'
                    : 'bg-white border-gray-100 text-gray-700 hover:border-gray-200'
                }`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${done ? (theme.isFemme ? 'border-pink-500 bg-pink-500' : 'border-brand-500 bg-brand-500') : 'border-gray-300'}`}>
                  {done && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-sm font-medium">{act.nom}</span>
              </button>
            )
          })}
        </div>
      </Layout>
    )
  }

  const totalSeries = exercices.reduce((acc, ex) => acc + ex.sets, 0)
  const doneSeries  = Object.values(series).reduce((acc, arr) => acc + arr.filter(s => s.reps || s.charge).length, 0)
  const pct = totalSeries > 0 ? Math.round((doneSeries / totalSeries) * 100) : 0

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <Link to={profile?.role === 'coach' ? -1 : '/athlete'} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-xl font-semibold">{seance?.nom}</h1>
        {isCoachEditing && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Mode édition coach</span>}
      </div>
      <div className="mb-5">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{doneSeries} / {totalSeries} séries</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${theme.progress} rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {exercices.map(ex => (
          <ExerciceCard key={ex.id} exercice={ex}
            series={series[ex.id] || []}
            prevSeries={seriesPrev[ex.nom] || []}
            theme={theme}
            onAddSerie={(num) => addSerie(ex.id, num)}
            onUpdate={(serieId, field, val) => updateSerie(serieId, ex.id, field, val)}
            onDelete={(serieId) => deleteSerie(serieId, ex.id)}
          />
        ))}
      </div>
    </Layout>
  )
}

function ExerciceCard({ exercice, series, prevSeries, onAddSerie, onUpdate, onDelete, theme }) {
  const nextSet = series.length + 1
  const canAddSet = series.length < exercice.sets

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{exercice.nom}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {exercice.muscle && <span className="mr-1">{exercice.muscle} ·</span>}
            <span className={`font-medium ${theme.isFemme ? 'text-pink-600' : 'text-brand-600'}`}>{exercice.sets} × {exercice.rep_range}</span>
            {exercice.repos && <span className="ml-1 text-gray-400">· {exercice.repos}</span>}
          </p>
          {exercice.indications && <p className="text-xs text-amber-600 mt-0.5 font-medium">{exercice.indications}</p>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${
          series.length >= exercice.sets ? 'bg-green-50 text-green-700'
          : series.length > 0 ? 'bg-amber-50 text-amber-700'
          : 'bg-gray-50 text-gray-400'
        }`}>
          {series.length}/{exercice.sets}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* En-têtes colonnes — optimisé mobile */}
        {series.length > 0 && (
          <div className="grid grid-cols-10 gap-1.5 text-xs text-gray-400 font-medium px-0.5 mb-1">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-3">kg</div>
            <div className="col-span-3">Reps</div>
            <div className="col-span-3">Note</div>
          </div>
        )}

        {series.map((s, i) => (
          <SerieRow key={s.id} serie={s} index={i + 1}
            prevSerie={prevSeries[i] || null}
            repRange={exercice.rep_range} theme={theme}
            onUpdate={(field, val) => onUpdate(s.id, field, val)}
            onDelete={() => onDelete(s.id)}
          />
        ))}

        {canAddSet ? (
          <button onClick={() => onAddSerie(nextSet)}
            className={`w-full mt-1 py-2.5 border border-dashed rounded-lg text-sm font-medium transition-colors ${
              theme.isFemme ? 'border-pink-200 text-pink-400 hover:border-pink-400 hover:text-pink-600' : 'border-gray-200 text-gray-400 hover:border-brand-400 hover:text-brand-600'
            }`}>
            + Set {nextSet}
            {prevSeries[series.length] && (
              <span className="ml-2 text-xs text-gray-300">
                (S-1 : {prevSeries[series.length].charge ? `${prevSeries[series.length].charge}kg` : '—'} × {prevSeries[series.length].reps || '—'})
              </span>
            )}
          </button>
        ) : (
          <div className="w-full mt-1 py-2 text-center text-xs text-green-600 font-medium">✓ Tous les sets complétés</div>
        )}
      </div>
    </div>
  )
}

function SerieRow({ serie, index, prevSerie, repRange, onUpdate, onDelete, theme }) {
  const [charge, setCharge] = useState(serie.charge ?? '')
  const [reps, setReps]     = useState(serie.reps ?? '')
  const [notes, setNotes]   = useState(serie.notes ?? '')
  const chargeRef = useRef(null)

  useEffect(() => {
    if (!serie.charge && !serie.reps) chargeRef.current?.focus()
  }, [])

  const ringClass = theme.isFemme ? 'focus:ring-2 focus:ring-pink-300' : 'focus:ring-2 focus:ring-brand-400'
  const inputClass = `w-full border border-gray-100 rounded-lg px-2 py-2.5 text-sm focus:outline-none bg-gray-50 focus:bg-white transition-colors ${ringClass}`

  return (
    <div className="space-y-0.5">
      <div className="grid grid-cols-10 gap-1.5 items-center group">
        <div className="col-span-1 text-xs font-medium text-gray-400 text-center">{index}</div>
        <div className="col-span-3">
          <input ref={chargeRef} type="number" inputMode="decimal" value={charge}
            placeholder={prevSerie?.charge ? String(prevSerie.charge) : '—'}
            onChange={e => setCharge(e.target.value)} onBlur={() => onUpdate('charge', charge)}
            className={inputClass} />
        </div>
        <div className="col-span-3">
          <input type="number" inputMode="numeric" value={reps}
            placeholder={prevSerie?.reps ? String(prevSerie.reps) : (repRange || '—')}
            onChange={e => setReps(e.target.value)} onBlur={() => onUpdate('reps', reps)}
            className={inputClass} />
        </div>
        <div className="col-span-3 flex items-center gap-1">
          <input type="text" value={notes} placeholder="Note"
            onChange={e => setNotes(e.target.value)} onBlur={() => onUpdate('notes', notes)}
            className={inputClass + " flex-1"} />
          <button onClick={onDelete} className="text-gray-200 hover:text-red-400 text-base opacity-0 group-hover:opacity-100 flex-shrink-0">×</button>
        </div>
      </div>
      {/* Perfs semaine précédente en grisé */}
      {prevSerie && (prevSerie.charge || prevSerie.reps) && (
        <div className="grid grid-cols-10 gap-1.5 pl-0.5">
          <div className="col-span-1"></div>
          <div className="col-span-6 text-xs text-gray-300 pl-2">
            S-1 : {prevSerie.charge ? `${prevSerie.charge}kg` : '—'} × {prevSerie.reps || '—'} reps
            {prevSerie.notes ? ` · ${prevSerie.notes}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
