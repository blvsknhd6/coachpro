import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq; osc.type = 'sine'
      gain.gain.setValueAtTime(0.4, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur)
    }
    playTone(880, 0, 0.15); playTone(1046, 0.2, 0.15); playTone(1318, 0.4, 0.3)
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400])
  } catch (e) {}
}

export default function AthleteSeance() {
  const { seanceId, semaineId } = useParams()
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()

  const [seance, setSeance]                 = useState(null)
  const [exercices, setExercices]           = useState([])
  const [activites, setActivites]           = useState([])
  const [series, setSeries]                 = useState({})
  const [seriesPrev, setSeriesPrev]         = useState({})
  const [notePrev, setNotePrev]             = useState('')
  const [activitesRealisees, setActivitesRealisees] = useState({})
  const [noteSeance, setNoteSeance]         = useState('')
  const [noteSaved, setNoteSaved]           = useState(false)
  const [loading, setLoading]               = useState(true)
  const [isCoachEditing, setIsCoachEditing] = useState(false)
  const [targetAthleteId, setTargetAthleteId] = useState(null)
  const [chrono, setChrono]                 = useState(null)
  const [newActiviteInput, setNewActiviteInput] = useState('')
  const [addingActivite, setAddingActivite] = useState(false)
  const [showChargeIndicative, setShowChargeIndicative] = useState(false)
  const [showRpe, setShowRpe]               = useState(false)

  useEffect(() => { fetchAll() }, [seanceId, semaineId, profile])

  async function fetchAll() {
    if (!profile) return
    const { data: sc } = await supabase.from('seances').select('*').eq('id', seanceId).single()
    setSeance(sc)

    const { data: semaine } = await supabase.from('semaines').select('bloc_id').eq('id', semaineId).single()
    const { data: bloc } = semaine
      ? await supabase.from('blocs').select('athlete_id, show_charge_indicative, show_rpe').eq('id', semaine.bloc_id).single()
      : { data: null }

    const athId = bloc?.athlete_id || profile.id
    setTargetAthleteId(athId)
    setIsCoachEditing(profile.role === 'coach' && athId !== profile.id)
    setShowChargeIndicative(bloc?.show_charge_indicative || false)
    setShowRpe(bloc?.show_rpe || false)

    if (sc?.nom === 'Bonus') {
      const { data: acts } = await supabase.from('activites_bonus').select('*').eq('seance_id', seanceId).order('ordre')
      setActivites(acts || [])
      const { data: realisees } = await supabase.from('activites_realisees').select('*').eq('semaine_id', semaineId).eq('athlete_id', athId)
      const map = {}
      ;(realisees || []).forEach(r => { map[r.activite_id] = r.realisee })
      setActivitesRealisees(map)
      setLoading(false)
      return
    }

    const { data: exs } = await supabase.from('exercices').select('*').eq('seance_id', seanceId).order('ordre')
    setExercices(exs || [])

    const { data: sr } = await supabase.from('series_realisees').select('*')
      .eq('semaine_id', semaineId).eq('athlete_id', athId)
      .in('exercice_id', (exs || []).map(e => e.id)).order('numero_set')
    const map = {}
    ;(exs || []).forEach(ex => { map[ex.id] = [] })
    ;(sr || []).forEach(s => { if (map[s.exercice_id]) map[s.exercice_id].push(s) })
    setSeries(map)

    const { data: noteData } = await supabase.from('notes_seances').select('contenu')
      .eq('athlete_id', athId).eq('seance_id', seanceId).eq('semaine_id', semaineId).single()
    setNoteSeance(noteData?.contenu || '')

    await fetchSeriesPrev(exs || [], semaineId, athId, sc?.nom)
    setLoading(false)
  }

  async function fetchSeriesPrev(exs, currentSemaineId, athId, seanceNom) {
    const { data: semaineCourante } = await supabase.from('semaines').select('numero, bloc_id').eq('id', currentSemaineId).single()
    if (!semaineCourante || semaineCourante.numero <= 1) return
    const { data: semPrev } = await supabase.from('semaines').select('id')
      .eq('bloc_id', semaineCourante.bloc_id).eq('numero', semaineCourante.numero - 1).single()
    if (!semPrev) return
    const { data: seancePrev } = await supabase.from('seances').select('id')
      .eq('semaine_id', semPrev.id).eq('nom', seanceNom || '').single()
    if (!seancePrev) return

    const { data: notePrevData } = await supabase.from('notes_seances').select('contenu')
      .eq('athlete_id', athId).eq('seance_id', seancePrev.id).eq('semaine_id', semPrev.id).single()
    setNotePrev(notePrevData?.contenu || '')

    const { data: exsPrev } = await supabase.from('exercices').select('*').eq('seance_id', seancePrev.id).order('ordre')
    const { data: srPrev } = await supabase.from('series_realisees').select('*')
      .eq('semaine_id', semPrev.id).eq('athlete_id', athId)
      .in('exercice_id', (exsPrev || []).map(e => e.id)).order('numero_set')
    const mapByNom = {}
    ;(exsPrev || []).forEach(ex => { mapByNom[ex.nom] = [] })
    ;(srPrev || []).forEach(s => {
      const ex = (exsPrev || []).find(e => e.id === s.exercice_id)
      if (ex && mapByNom[ex.nom]) mapByNom[ex.nom].push(s)
    })
    setSeriesPrev(mapByNom)
  }

  async function saveNoteSeance(contenu) {
    if (!targetAthleteId) return
    await supabase.from('notes_seances').upsert({
      athlete_id: targetAthleteId, seance_id: seanceId, semaine_id: semaineId,
      contenu: contenu.trim() || null,
    }, { onConflict: 'athlete_id,seance_id,semaine_id' })
    setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2000)
  }

  async function addSerie(exerciceId, numeroSet) {
    if (!targetAthleteId) return
    const { data } = await supabase.from('series_realisees').upsert({
      exercice_id: exerciceId, semaine_id: semaineId, athlete_id: targetAthleteId,
      numero_set: numeroSet, charge: null, reps: null, rpe: null,
    }, { onConflict: 'exercice_id,semaine_id,athlete_id,numero_set' }).select().single()
    setSeries(prev => ({
      ...prev,
      [exerciceId]: [...(prev[exerciceId] || []).filter(s => s.numero_set !== numeroSet), data]
        .sort((a, b) => a.numero_set - b.numero_set)
    }))
  }

  async function updateSerie(serieId, exerciceId, field, value) {
    await supabase.from('series_realisees').update({ [field]: value === '' ? null : value }).eq('id', serieId)
    setSeries(prev => ({
      ...prev,
      [exerciceId]: prev[exerciceId].map(s => s.id === serieId ? { ...s, [field]: value } : s)
    }))
  }

  async function deleteSerie(serieId, exerciceId) {
    await supabase.from('series_realisees').delete().eq('id', serieId)
    setSeries(prev => ({ ...prev, [exerciceId]: prev[exerciceId].filter(s => s.id !== serieId) }))
  }

  async function toggleActivite(activiteId, current) {
    if (!targetAthleteId) return
    const newVal = !current
    setActivitesRealisees(prev => ({ ...prev, [activiteId]: newVal }))
    await supabase.from('activites_realisees').upsert({
      activite_id: activiteId, semaine_id: semaineId, athlete_id: targetAthleteId, realisee: newVal,
    }, { onConflict: 'activite_id,semaine_id,athlete_id' })
  }

  async function addCustomActivite() {
    if (!newActiviteInput.trim()) return
    const ordre = activites.length
    const { data } = await supabase.from('activites_bonus')
      .insert({ seance_id: seanceId, nom: newActiviteInput.trim(), ordre }).select().single()
    if (data) {
      setActivites(prev => [...prev, data])
      setNewActiviteInput('')
      setAddingActivite(false)
    }
  }

  const goBack = () => { if (window.history.length > 1) navigate(-1); else navigate('/athlete') }

  if (loading) return <Layout><p className="text-sm text-gray-400">Chargement…</p></Layout>

  // ── Vue Bonus ─────────────────────────────────────────────────────────────
  if (seance?.nom === 'Bonus') {
    const doneCount = activites.filter(a => activitesRealisees[a.id]).length
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={goBack} className="text-sm text-gray-400 hover:text-gray-700">← Retour</button>
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
                    ? (theme.isFemme ? 'bg-pink-50 border-pink-200 text-pink-800' : 'bg-brand-50 border-brand-200 text-brand-800')
                    : 'bg-white border-gray-100 text-gray-700'
                }`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  done
                    ? (theme.isFemme ? 'border-pink-500 bg-pink-500' : 'border-brand-500 bg-brand-500')
                    : 'border-gray-300'
                }`}>
                  {done && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-sm font-medium">{act.nom}</span>
              </button>
            )
          })}
          {addingActivite ? (
            <div className="flex gap-2">
              <input autoFocus value={newActiviteInput} onChange={e => setNewActiviteInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomActivite()}
                placeholder="Nom de l'activité…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <button onClick={addCustomActivite}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.isFemme ? 'bg-pink-600 text-white' : 'bg-brand-600 text-white'}`}>✓</button>
              <button onClick={() => setAddingActivite(false)}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-600">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingActivite(true)}
              className="w-full py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-gray-300 transition-colors">
              + Ajouter une activité
            </button>
          )}
        </div>
      </Layout>
    )
  }

  // ── Vue séance normale ────────────────────────────────────────────────────
  const totalSeries = exercices.reduce((acc, ex) => acc + ex.sets, 0)
  const doneSeries  = Object.values(series).reduce((acc, arr) => acc + arr.filter(s => s.reps || s.charge).length, 0)
  const pct = totalSeries > 0 ? Math.round((doneSeries / totalSeries) * 100) : 0
  const hasSeriesPrev = Object.values(seriesPrev).some(arr => arr.some(s => s.charge || s.reps))

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <button onClick={goBack} className="text-sm text-gray-400 hover:text-gray-700">← Retour</button>
        <h1 className="text-xl font-semibold">{seance?.nom}</h1>
        {isCoachEditing && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Mode édition coach</span>}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{doneSeries} / {totalSeries} séries</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${theme.progress} rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(hasSeriesPrev || notePrev) && (
        <RecapSemainePrev exercices={exercices} seriesPrev={seriesPrev} notePrev={notePrev} theme={theme} />
      )}

      <div className="space-y-3">
        {exercices.map(ex => (
          <ExerciceCard key={ex.id} exercice={ex}
            series={series[ex.id] || []}
            prevSeries={seriesPrev[ex.nom] || []}
            showChargeIndicative={showChargeIndicative}
            showRpe={showRpe}
            theme={theme}
            onAddSerie={(num) => addSerie(ex.id, num)}
            onUpdate={(serieId, field, val) => updateSerie(serieId, ex.id, field, val)}
            onDelete={(serieId) => deleteSerie(serieId, ex.id)}
            onStartChrono={(duree) => setChrono({ duree })}
          />
        ))}
      </div>

      <div className="mt-4 bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">📝 Note générale de séance</p>
        <textarea value={noteSeance} onChange={e => setNoteSeance(e.target.value)}
          onBlur={() => saveNoteSeance(noteSeance)}
          placeholder="Comment s'est passée la séance ? Fatigue, ressenti, observations…"
          rows={3}
          className={`w-full border border-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-gray-50 focus:bg-white resize-none ${theme.isFemme ? 'focus:ring-2 focus:ring-pink-300' : 'focus:ring-2 focus:ring-brand-400'}`}
        />
        {noteSaved && <p className="text-xs text-green-500 mt-1">✓ Note enregistrée</p>}
      </div>

      {chrono && <ChronoRepos duree={chrono.duree} onClose={() => setChrono(null)} />}
    </Layout>
  )
}

// ── Récap semaine précédente ──────────────────────────────────────────────
function RecapSemainePrev({ exercices, seriesPrev, notePrev, theme }) {
  const [open, setOpen] = useState(true)
  const exsAvecPerfs = exercices.filter(ex => (seriesPrev[ex.nom] || []).some(s => s.charge || s.reps))
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl mb-4 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
        <p className="text-xs font-medium text-gray-500">📊 Semaine précédente</p>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2.5">
          {notePrev && (
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 italic">💬 {notePrev}</div>
          )}
          {exsAvecPerfs.map(ex => (
            <div key={ex.id}>
              <p className="text-xs font-medium text-gray-600 mb-1">{ex.nom}</p>
              <div className="flex flex-wrap gap-1">
                {(seriesPrev[ex.nom] || []).map((s, i) => (
                  <span key={i} className={`text-xs border px-2 py-0.5 rounded-md ${theme.isFemme ? 'bg-pink-50 border-pink-100 text-pink-600' : 'bg-brand-50 border-brand-100 text-brand-600'}`}>
                    S{i + 1} : {s.charge ? `${s.charge}kg` : '—'} × {s.reps || '—'}
                    {s.rpe ? ` @${s.rpe}` : ''}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Carte exercice ────────────────────────────────────────────────────────
function ExerciceCard({ exercice, series, prevSeries, showChargeIndicative, showRpe, onAddSerie, onUpdate, onDelete, theme, onStartChrono }) {
  const nextSet   = series.length + 1
  const canAddSet = series.length < exercice.sets
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-gray-900 truncate">{exercice.nom}</p>
            {exercice.unilateral && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0">×2</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {exercice.muscle && <span className="mr-1">{exercice.muscle} ·</span>}
            <span className={`font-medium ${theme.isFemme ? 'text-pink-600' : 'text-brand-600'}`}>
              {exercice.sets} × {exercice.rep_range}
            </span>
            {exercice.repos && <span className="ml-1">· {exercice.repos}</span>}
            {showChargeIndicative && exercice.charge_indicative && (
              <span className="ml-1 text-gray-500">· {exercice.charge_indicative}kg indic.</span>
            )}
            {showRpe && exercice.rpe_cible && (
              <span className="ml-1 text-gray-500">· @{exercice.rpe_cible} cible</span>
            )}
          </p>
          {exercice.indications && (
            <p className="text-xs text-amber-600 mt-0.5 font-medium">{exercice.indications}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${
          series.length >= exercice.sets ? 'bg-green-50 text-green-700'
          : series.length > 0 ? 'bg-amber-50 text-amber-700'
          : 'bg-gray-50 text-gray-400'
        }`}>{series.length}/{exercice.sets}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {series.map((s, i) => (
          <SerieRow key={s.id} serie={s} index={i + 1}
            prevSerie={prevSeries[i] || null}
            repos={exercice.repos}
            repRange={exercice.rep_range}
            showRpe={showRpe}
            theme={theme}
            onUpdate={(field, val) => onUpdate(s.id, field, val)}
            onDelete={() => onDelete(s.id)}
            onStartChrono={() => onStartChrono(exercice.repos)}
          />
        ))}
        {canAddSet ? (
          <button onClick={() => onAddSerie(nextSet)}
            className={`w-full mt-1 py-2.5 border border-dashed rounded-lg text-sm font-medium transition-colors ${
              theme.isFemme
                ? 'border-pink-200 text-pink-400 hover:border-pink-400 hover:text-pink-600'
                : 'border-gray-200 text-gray-400 hover:border-brand-400 hover:text-brand-600'
            }`}>
            + Set {nextSet}
            {prevSeries[series.length] && (
              <span className="ml-2 text-xs text-gray-300">
                S-1 : {prevSeries[series.length].charge ? `${prevSeries[series.length].charge}kg` : '—'} × {prevSeries[series.length].reps || '—'}
                {prevSeries[series.length].rpe ? ` @${prevSeries[series.length].rpe}` : ''}
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

// ── Ligne de série ────────────────────────────────────────────────────────
function SerieRow({ serie, index, prevSerie, repRange, repos, showRpe, onUpdate, onDelete, theme, onStartChrono }) {
  const [charge, setCharge] = useState(serie.charge ?? '')
  const [reps, setReps]     = useState(serie.reps   ?? '')
  const [rpe, setRpe]       = useState(serie.rpe    ?? '')
  const [notes, setNotes]   = useState(serie.notes  ?? '')
  const chargeRef = useRef(null)

  useEffect(() => { if (!serie.charge && !serie.reps) chargeRef.current?.focus() }, [])

  const ringClass  = theme.isFemme ? 'focus:ring-2 focus:ring-pink-300' : 'focus:ring-2 focus:ring-brand-400'
  const inputBase  = `border border-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-gray-50 focus:bg-white transition-colors ${ringClass}`

  return (
    <div className="space-y-1 pb-2 border-b border-gray-50 last:border-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="w-5 text-xs font-medium text-gray-400 text-center flex-shrink-0">{index}</span>

        {/* Charge */}
        <input ref={chargeRef} type="number" inputMode="decimal" value={charge}
          placeholder={prevSerie?.charge ? String(prevSerie.charge) : 'kg'}
          onChange={e => setCharge(e.target.value)}
          onBlur={() => onUpdate('charge', charge)}
          className={inputBase + ' flex-1'}
        />

        {/* Reps */}
        <input type="number" inputMode="numeric" value={reps}
          placeholder={prevSerie?.reps ? String(prevSerie.reps) : (repRange || 'reps')}
          onChange={e => setReps(e.target.value)}
          onBlur={() => { onUpdate('reps', reps); if (reps) onStartChrono() }}
          className={inputBase + ' flex-1'}
        />

        {/* RPE dropdown — visible seulement si le coach a activé show_rpe sur le bloc */}
        {showRpe && (
          <select
            value={rpe}
            onChange={e => { setRpe(e.target.value); onUpdate('rpe', e.target.value || null) }}
            className={inputBase + ' flex-shrink-0 w-[72px] pr-1 text-xs'}
          >
            <option value="">RPE</option>
            {RPE_VALUES.map(v => (
              <option key={v} value={v}>@{v}</option>
            ))}
          </select>
        )}

        <button onClick={onDelete} className="text-gray-200 hover:text-red-400 text-xl flex-shrink-0">×</button>
      </div>

      {/* Note + référence S-1 */}
      <div className="flex gap-2 items-center pl-7">
        <input type="text" value={notes} placeholder="Note (facile, douleur…)"
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onUpdate('notes', notes)}
          className={inputBase + ' flex-1 text-xs py-2'}
        />
      </div>

      {prevSerie && (prevSerie.charge || prevSerie.reps) && (
        <div className="pl-7">
          <p className="text-xs text-gray-300">
            S-1 : {prevSerie.charge ? `${prevSerie.charge}kg` : '—'} × {prevSerie.reps || '—'}
            {prevSerie.rpe ? ` @${prevSerie.rpe}` : ''}
            {prevSerie.notes ? ` · ${prevSerie.notes}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Chrono de repos ───────────────────────────────────────────────────────
function ChronoRepos({ duree, onClose }) {
  const secondes = (() => {
    if (!duree) return 120
    const matchFull = duree.match(/(\d+)'(\d+)?/)
    if (matchFull) return parseInt(matchFull[1]) * 60 + parseInt(matchFull[2] || '0')
    const matchSec = duree.match(/(\d+)''/)
    if (matchSec) return parseInt(matchSec[1])
    return 120
  })()
  const [remaining, setRemaining] = useState(secondes)
  const [running, setRunning]     = useState(true)
  const beeped = useRef(false)

  useEffect(() => {
    if (!running || remaining <= 0) return
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, running])

  useEffect(() => {
    if (remaining <= 0 && !beeped.current) { beeped.current = true; playBeep() }
  }, [remaining])

  const pct  = Math.round((remaining / secondes) * 100)
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const isDone = remaining <= 0

  return (
    <div className={`fixed bottom-4 left-4 right-4 rounded-2xl p-4 z-50 flex items-center gap-4 shadow-xl ${isDone ? 'bg-green-600' : remaining <= 10 ? 'bg-red-600' : 'bg-gray-900'} text-white`}>
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4"/>
          <circle cx="28" cy="28" r="24" fill="none"
            stroke={isDone ? '#ffffff' : remaining <= 10 ? '#fca5a5' : '#818cf8'}
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 24}`}
            strokeDashoffset={`${2 * Math.PI * 24 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
          {isDone ? '✓' : `${mins}:${String(secs).padStart(2, '0')}`}
        </div>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{isDone ? "C'est reparti !" : remaining <= 10 ? 'Presque fini…' : 'Temps de repos'}</p>
        <p className="text-xs opacity-70">{isDone ? 'Lance ton prochain set' : `${duree} · garde l'écran allumé`}</p>
      </div>
      <div className="flex gap-2">
        {!isDone && (
          <button onClick={() => setRunning(r => !r)}
            className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
            {running ? '⏸' : '▶'}
          </button>
        )}
        <button onClick={onClose} className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">✕</button>
      </div>
    </div>
  )
}
