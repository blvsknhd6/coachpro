import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function AthleteSeance() {
  const { seanceId, semaineId } = useParams()
  const { profile } = useAuth()
  const [seance, setSeance]     = useState(null)
  const [exercices, setExercices] = useState([])
  const [activites, setActivites] = useState([])
  const [series, setSeries]     = useState({}) // { exerciceId: [{ id, numero_set, charge, reps, notes }] }
  const [activitesRealisees, setActivitesRealisees] = useState({}) // { activiteId: boolean }
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchAll() }, [seanceId, semaineId, profile])

  async function fetchAll() {
    if (!profile) return
    const { data: sc } = await supabase.from('seances').select('*').eq('id', seanceId).single()
    setSeance(sc)

    if (sc?.nom === 'Bonus') {
      const { data: acts } = await supabase
        .from('activites_bonus')
        .select('*')
        .eq('seance_id', seanceId)
        .order('ordre')
      setActivites(acts || [])

      const { data: realisees } = await supabase
        .from('activites_realisees')
        .select('*')
        .eq('semaine_id', semaineId)
        .eq('athlete_id', profile.id)
      const map = {}
      ;(realisees || []).forEach(r => { map[r.activite_id] = r.realisee })
      setActivitesRealisees(map)
      setLoading(false)
      return
    }

    const { data: exs } = await supabase
      .from('exercices')
      .select('*')
      .eq('seance_id', seanceId)
      .order('ordre')
    setExercices(exs || [])

    const { data: sr } = await supabase
      .from('series_realisees')
      .select('*')
      .eq('semaine_id', semaineId)
      .eq('athlete_id', profile.id)
      .in('exercice_id', (exs || []).map(e => e.id))
      .order('numero_set')

    const map = {}
    ;(exs || []).forEach(ex => { map[ex.id] = [] })
    ;(sr || []).forEach(s => {
      if (map[s.exercice_id]) map[s.exercice_id].push(s)
    })
    setSeries(map)
    setLoading(false)
  }

  async function addSerie(exerciceId, numeroSet) {
    const { data } = await supabase
      .from('series_realisees')
      .upsert({
        exercice_id: exerciceId,
        semaine_id: semaineId,
        athlete_id: profile.id,
        numero_set: numeroSet,
        charge: null,
        reps: null,
      }, { onConflict: 'exercice_id,semaine_id,athlete_id,numero_set' })
      .select()
      .single()

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
      [exerciceId]: prev[exerciceId].map(s =>
        s.id === serieId ? { ...s, [field]: value } : s
      )
    }))
  }

  async function deleteSerie(serieId, exerciceId) {
    await supabase.from('series_realisees').delete().eq('id', serieId)
    setSeries(prev => ({
      ...prev,
      [exerciceId]: prev[exerciceId].filter(s => s.id !== serieId)
    }))
  }

  async function toggleActivite(activiteId, current) {
    const newVal = !current
    setActivitesRealisees(prev => ({ ...prev, [activiteId]: newVal }))
    await supabase.from('activites_realisees').upsert({
      activite_id: activiteId,
      semaine_id: semaineId,
      athlete_id: profile.id,
      realisee: newVal,
    }, { onConflict: 'activite_id,semaine_id,athlete_id' })
  }

  if (loading) return <Layout><p className="text-sm text-gray-400">Chargement…</p></Layout>

  // Vue Bonus
  if (seance?.nom === 'Bonus') {
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-6">
          <Link to="/athlete" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-semibold">Activités bonus</h1>
        </div>
        <div className="space-y-2">
          {activites.map(act => (
            <button
              key={act.id}
              onClick={() => toggleActivite(act.id, activitesRealisees[act.id])}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                activitesRealisees[act.id]
                  ? 'bg-brand-50 border-brand-200 text-brand-800'
                  : 'bg-white border-gray-100 text-gray-700 hover:border-gray-200'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                activitesRealisees[act.id] ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
              }`}>
                {activitesRealisees[act.id] && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className="text-sm font-medium">{act.nom}</span>
              {act.description && <span className="text-xs text-gray-400 ml-auto">{act.description}</span>}
            </button>
          ))}
        </div>
      </Layout>
    )
  }

  // Vue séance normale
  const totalSeries = exercices.reduce((acc, ex) => acc + ex.sets, 0)
  const doneSeries  = Object.values(series).reduce((acc, arr) => acc + arr.filter(s => s.reps || s.charge).length, 0)
  const pct = totalSeries > 0 ? Math.round((doneSeries / totalSeries) * 100) : 0

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-2">
        <Link to="/athlete" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-xl font-semibold">{seance?.nom}</h1>
      </div>

      {/* Barre de progression */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{doneSeries} / {totalSeries} séries</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-4">
        {exercices.map(ex => (
          <ExerciceCard
            key={ex.id}
            exercice={ex}
            series={series[ex.id] || []}
            onAddSerie={(num) => addSerie(ex.id, num)}
            onUpdate={(serieId, field, val) => updateSerie(serieId, ex.id, field, val)}
            onDelete={(serieId) => deleteSerie(serieId, ex.id)}
          />
        ))}
      </div>
    </Layout>
  )
}

function ExerciceCard({ exercice, series, onAddSerie, onUpdate, onDelete }) {
  const nextSet = (series.length + 1)
  const canAddSet = series.length < exercice.sets

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      {/* Header exercice */}
      <div className="px-5 py-3 border-b border-gray-50 flex items-start justify-between">
        <div>
          <p className="font-medium text-sm text-gray-900">{exercice.nom}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {exercice.muscle && <span className="mr-2">{exercice.muscle}</span>}
            <span className="font-medium text-gray-500">{exercice.sets} × {exercice.rep_range} reps</span>
            {exercice.repos && <span className="ml-2 text-gray-400">· repos {exercice.repos}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            series.length >= exercice.sets
              ? 'bg-green-50 text-green-700'
              : series.length > 0
              ? 'bg-amber-50 text-amber-700'
              : 'bg-gray-50 text-gray-400'
          }`}>
            {series.length}/{exercice.sets}
          </span>
        </div>
      </div>

      {/* Séries */}
      <div className="px-5 py-3 space-y-2">
        {/* En-têtes */}
        {series.length > 0 && (
          <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1 mb-1">
            <div className="col-span-1">Set</div>
            <div className="col-span-4">Charge (kg)</div>
            <div className="col-span-4">Reps</div>
            <div className="col-span-2">Notes</div>
            <div className="col-span-1"></div>
          </div>
        )}

        {series.map((s, i) => (
          <SerieRow
            key={s.id}
            serie={s}
            index={i + 1}
            repRange={exercice.rep_range}
            onUpdate={(field, val) => onUpdate(s.id, field, val)}
            onDelete={() => onDelete(s.id)}
          />
        ))}

        {/* Bouton ajouter une série */}
        {canAddSet ? (
          <button
            onClick={() => onAddSerie(nextSet)}
            className="w-full mt-1 py-2.5 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors font-medium"
          >
            + Set {nextSet}
          </button>
        ) : (
          <div className="w-full mt-1 py-2 text-center text-xs text-green-600 font-medium">
            ✓ Tous les sets complétés
          </div>
        )}
      </div>
    </div>
  )
}

function SerieRow({ serie, index, repRange, onUpdate, onDelete }) {
  const [charge, setCharge] = useState(serie.charge ?? '')
  const [reps, setReps]     = useState(serie.reps ?? '')
  const [notes, setNotes]   = useState(serie.notes ?? '')
  const chargeRef = useRef(null)

  // Focus auto sur la charge quand la ligne apparaît
  useEffect(() => {
    if (!serie.charge && !serie.reps) chargeRef.current?.focus()
  }, [])

  return (
    <div className="grid grid-cols-12 gap-2 items-center group">
      {/* Numéro */}
      <div className="col-span-1 text-xs font-medium text-gray-400 text-center">{index}</div>

      {/* Charge */}
      <div className="col-span-4">
        <input
          ref={chargeRef}
          type="number"
          inputMode="decimal"
          value={charge}
          placeholder="— kg"
          onChange={e => setCharge(e.target.value)}
          onBlur={() => onUpdate('charge', charge)}
          className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      {/* Reps */}
      <div className="col-span-4">
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          placeholder={repRange || '—'}
          onChange={e => setReps(e.target.value)}
          onBlur={() => onUpdate('reps', reps)}
          className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      {/* Notes */}
      <div className="col-span-2">
        <input
          type="text"
          value={notes}
          placeholder="Note"
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onUpdate('notes', notes)}
          className="w-full border border-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      {/* Supprimer */}
      <div className="col-span-1 flex justify-center">
        <button
          onClick={onDelete}
          className="text-gray-200 hover:text-red-400 transition-colors text-lg leading-none opacity-0 group-hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  )
}
