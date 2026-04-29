import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import { MUSCLES, EXERCICES_PAR_MUSCLE, TEMPS_REPOS, BONUS_DEFAUT } from '../../lib/exercices'

const LIFT_EMOJIS = { squat: '🏋️', bench: '💪', deadlift: '⚡' }

function PowerliftingMaxEditor({ blocId, athleteId }) {
  const [maxes, setMaxes]     = useState({ squat: '', bench: '', deadlift: '' })
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchMaxes() }, [blocId, athleteId])

  async function fetchMaxes() {
    const { data } = await supabase.from('powerlifting_maxes').select('lift, max_kg')
      .eq('bloc_id', blocId).eq('athlete_id', athleteId)
    const m = { squat: '', bench: '', deadlift: '' }
    ;(data || []).forEach(r => { m[r.lift] = r.max_kg })
    setMaxes(m); setLoading(false)
  }

  async function saveMax(lift) {
    const val = maxes[lift]; if (!val) return
    await supabase.from('powerlifting_maxes').upsert(
      { athlete_id: athleteId, bloc_id: blocId, lift, max_kg: Number(val), date_test: new Date().toISOString().split('T')[0] },
      { onConflict: 'athlete_id,bloc_id,lift' }
    )
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  if (loading) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
      <p className="text-xs font-semibold text-amber-700 mb-3">🏋️ Maxes de référence (1RM)</p>
      <div className="grid grid-cols-3 gap-3">
        {(['squat', 'bench', 'deadlift']).map(lift => (
          <div key={lift}>
            <label className="text-xs text-amber-600 font-medium block mb-1">
              {LIFT_EMOJIS[lift]} {lift.charAt(0).toUpperCase() + lift.slice(1)}
            </label>
            <div className="flex gap-1 items-center">
              <input type="number" value={maxes[lift]}
                onChange={e => setMaxes(m => ({ ...m, [lift]: e.target.value }))}
                onBlur={() => saveMax(lift)} placeholder="—"
                className="w-full border border-amber-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
              <span className="text-xs text-amber-500 flex-shrink-0">kg</span>
            </div>
            {maxes[lift] && (
              <p className="text-xs text-amber-500 mt-0.5">
                90% → {Math.round(Number(maxes[lift]) * 0.9 / 2.5) * 2.5}kg
              </p>
            )}
          </div>
        ))}
      </div>
      {saved && <p className="text-xs text-green-600 mt-2">✓ Maxes enregistrés</p>}
    </div>
  )
}

export default function CoachBlocEditor() {
  const { blocId } = useParams()
  const [bloc, setBloc]                     = useState(null)
  const [semaines, setSemaines]             = useState([])
  const [activeSemaine, setActiveSemaine]   = useState(null)
  const [seances, setSeances]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [showCreateBloc, setShowCreateBloc] = useState(false)
  const [customExos, setCustomExos]         = useState({})
  const [confirmDeleteSemaine, setConfirmDeleteSemaine] = useState(null)
  const [editingDateSemaine, setEditingDateSemaine]     = useState(null)

  useEffect(() => { fetchBloc() }, [blocId])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBloc() {
    const { data: b } = await supabase.from('blocs').select('*').eq('id', blocId).single()
    setBloc(b)
    const { data: s } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(s || [])
    if (s?.length) setActiveSemaine(s[0])
    else { setLoading(false); setShowCreateBloc(true) }
    fetchCustomExos()
  }

  async function fetchCustomExos() {
    const { data } = await supabase.from('exercices_custom').select('*')
    const map = {}
    ;(data || []).forEach(ex => { if (!map[ex.muscle]) map[ex.muscle] = []; map[ex.muscle].push(ex.nom) })
    setCustomExos(map)
  }

  function getExosPourMuscle(muscle) {
    return [
      ...(EXERCICES_PAR_MUSCLE[muscle] || []),
      ...(customExos[muscle] || []).filter(c => !(EXERCICES_PAR_MUSCLE[muscle] || []).includes(c)),
    ]
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    const { data } = await supabase
      .from('seances').select('*, exercices(*), activites_bonus(*)')
      .eq('semaine_id', semaineId).order('ordre')
    setSeances(data || []); setLoading(false)
  }

  async function createBlocStructure({ nomsSeances, nbSemaines, dateDebut }) {
    // Batch insert toutes les semaines
    const semainesPayload = Array.from({ length: nbSemaines }, (_, i) => {
      const payload = { bloc_id: blocId, numero: i + 1 }
      if (dateDebut) {
        const d = new Date(dateDebut + 'T12:00:00')
        d.setDate(d.getDate() + i * 7)
        payload.date_debut = d.toISOString().split('T')[0]
      }
      return payload
    })
    const { data: semaineCrees } = await supabase.from('semaines').insert(semainesPayload).select()

    // Batch insert toutes les séances
    const allSeancesPayload = semaineCrees.flatMap(sem => [
      ...nomsSeances.map((nom, j) => ({ semaine_id: sem.id, nom, ordre: j })),
      { semaine_id: sem.id, nom: 'Bonus', ordre: nomsSeances.length },
    ])
    const { data: allNewSeances } = await supabase.from('seances').insert(allSeancesPayload).select()

    // Batch insert activités bonus par défaut
    const bonusSeances = (allNewSeances || []).filter(s => s.nom === 'Bonus')
    if (bonusSeances.length) {
      await supabase.from('activites_bonus').insert(
        bonusSeances.flatMap(bonus =>
          BONUS_DEFAUT.map((nom, k) => ({ seance_id: bonus.id, nom, ordre: k }))
        )
      )
    }

    setSemaines(semaineCrees)
    setActiveSemaine(semaineCrees[0])
    setShowCreateBloc(false)
  }

  async function addSemaine() {
    const num     = (semaines[semaines.length - 1]?.numero || 0) + 1
    const lastSem = semaines[semaines.length - 1]

    // Calcule date_debut automatiquement si la semaine précédente en a une
    let dateDebut = null
    if (lastSem?.date_debut) {
      const d = new Date(lastSem.date_debut + 'T12:00:00')
      d.setDate(d.getDate() + 7)
      dateDebut = d.toISOString().split('T')[0]
    }

    const { data: newSem } = await supabase
      .from('semaines')
      .insert({ bloc_id: blocId, numero: num, date_debut: dateDebut })
      .select().single()

    if (semaines.length > 0) {
      const { data: ref } = await supabase
        .from('seances').select('*, exercices(*), activites_bonus(*)')
        .eq('semaine_id', semaines[0].id).order('ordre')

      if (ref?.length) {
        const { data: newSeances } = await supabase.from('seances')
          .insert(ref.map(sc => ({ semaine_id: newSem.id, nom: sc.nom, ordre: sc.ordre }))).select()

        const oldToNewSc = {}
        ref.forEach((sc, i) => { oldToNewSc[sc.id] = newSeances[i].id })

        const allExercices = ref.flatMap(sc =>
          (sc.exercices || []).map(ex => ({
            seance_id:         oldToNewSc[sc.id],
            muscle:            ex.muscle,     nom:      ex.nom,
            sets:              ex.sets,       rep_range: ex.rep_range,
            repos:             ex.repos,      indications: ex.indications,
            ordre:             ex.ordre,      charge_indicative: ex.charge_indicative,
            rpe_cible:         ex.rpe_cible,  unilateral: ex.unilateral,
            main_lift:         ex.main_lift,
          }))
        )
        const allBonus = ref.flatMap(sc =>
          (sc.activites_bonus || []).map(act => ({
            seance_id:   oldToNewSc[sc.id],
            nom:         act.nom,
            description: act.description,
            ordre:       act.ordre,
          }))
        )

        await Promise.all([
          allExercices.length ? supabase.from('exercices').insert(allExercices) : null,
          allBonus.length     ? supabase.from('activites_bonus').insert(allBonus) : null,
        ].filter(Boolean))
      }
    }

    setSemaines(s => [...s, newSem]); setActiveSemaine(newSem)
  }

  async function updateSemaineDate(semaineId, dateValue) {
    await supabase.from('semaines').update({ date_debut: dateValue || null }).eq('id', semaineId)
    setSemaines(prev => prev.map(s => s.id === semaineId ? { ...s, date_debut: dateValue || null } : s))
    if (activeSemaine?.id === semaineId) setActiveSemaine(s => ({ ...s, date_debut: dateValue || null }))
    setEditingDateSemaine(null)
  }

  async function deleteSemaine(semaineId) {
    await supabase.from('semaines').delete().eq('id', semaineId)
    const remaining = semaines.filter(s => s.id !== semaineId).map((s, i) => ({ ...s, numero: i + 1 }))
    await Promise.all(remaining.map(s => supabase.from('semaines').update({ numero: s.numero }).eq('id', s.id)))
    setSemaines(remaining)
    setActiveSemaine(remaining[remaining.length - 1] || null)
    setConfirmDeleteSemaine(null)
  }

  async function propagate(seanceNom, currentNum) {
    const suiv = semaines.filter(s => s.numero > currentNum)
    if (!suiv.length) return

    const sc = seances.find(s => s.nom === seanceNom); if (!sc) return
    const { data: exsCour } = await supabase.from('exercices').select('*').eq('seance_id', sc.id).order('ordre')
    if (!exsCour?.length) return

    const { data: scSuivAll } = await supabase.from('seances').select('id, semaine_id')
      .in('semaine_id', suiv.map(s => s.id)).eq('nom', seanceNom)
    if (!scSuivAll?.length) return

    const { data: exsExAll } = await supabase.from('exercices').select('*')
      .in('seance_id', scSuivAll.map(s => s.id)).order('ordre')

    const ordres  = new Set(exsCour.map(e => e.ordre))
    const updates = [], inserts = [], deleteIds = []

    for (const scSuiv of scSuivAll) {
      const exsEx   = (exsExAll || []).filter(e => e.seance_id === scSuiv.id)
      const byOrdre = {}
      exsEx.forEach(e => { byOrdre[e.ordre] = e })

      for (const ex of exsCour) {
        // CORRECTION : On retire charge_indicative et rpe_cible de la propagation
        const payload = {
          muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
          rep_range: ex.rep_range, repos: ex.repos,
          unilateral: ex.unilateral, main_lift: ex.main_lift,
        }
        const cible = byOrdre[ex.ordre]
        if (cible) updates.push({ id: cible.id, ...payload })
        else inserts.push({ seance_id: scSuiv.id, ordre: ex.ordre, indications: ex.indications, charge_indicative: null, rpe_cible: null, ...payload })
      }
      const aSup = exsEx.filter(e => !ordres.has(e.ordre))
      deleteIds.push(...aSup.map(e => e.id))
    }

    await Promise.all([
      ...updates.map(({ id, ...payload }) => supabase.from('exercices').update(payload).eq('id', id)),
      inserts.length   ? supabase.from('exercices').insert(inserts) : null,
      deleteIds.length ? supabase.from('exercices').delete().in('id', deleteIds) : null,
    ].filter(Boolean))
  }

  async function addExercice(seanceId, seanceNom) {
    const s = seances.find(sc => sc.id === seanceId)
    await supabase.from('exercices').insert({
      seance_id: seanceId, nom: '', sets: 3, rep_range: '8-10', repos: "2'", ordre: s?.exercices?.length || 0,
    })
    await fetchSeances(activeSemaine.id)
    await propagate(seanceNom, activeSemaine.numero)
  }

  async function updateExercice(id, field, value, seanceNom) {
    await supabase.from('exercices').update({ [field]: value }).eq('id', id)
    
    // CORRECTION : On ne propage pas non plus charge_indicative ni rpe_cible
    if (!['indications', 'charge_indicative', 'rpe_cible'].includes(field)) {
      setSeances(prev => prev.map(sc => ({
        ...sc,
        exercices: (sc.exercices || []).map(ex => ex.id === id ? { ...ex, [field]: value } : ex),
      })))
      await propagate(seanceNom, activeSemaine.numero)
    }
  }

  async function deleteExercice(id, seanceNom) {
    await supabase.from('exercices').delete().eq('id', id)
    await fetchSeances(activeSemaine.id)
    await propagate(seanceNom, activeSemaine.numero)
  }

  async function reorderExercices(seanceId, fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const sc  = seances.find(s => s.id === seanceId); if (!sc) return
    const exs = [...(sc.exercices || [])].sort((a, b) => a.ordre - b.ordre)
    const [moved] = exs.splice(fromIdx, 1); exs.splice(toIdx, 0, moved)
    const updated = exs.map((ex, i) => ({ ...ex, ordre: i }))
    setSeances(prev => prev.map(s => s.id === seanceId ? { ...s, exercices: updated } : s))
    await Promise.all(updated.map(ex => supabase.from('exercices').update({ ordre: ex.ordre }).eq('id', ex.id)))
    await propagate(sc.nom, activeSemaine.numero)
  }

  async function updateSeanceNom(seanceId, ancien, nouveau) {
    const suivIds = semaines.filter(s => s.numero > activeSemaine.numero).map(s => s.id)
    await Promise.all([
      supabase.from('seances').update({ nom: nouveau }).eq('id', seanceId),
      suivIds.length
        ? supabase.from('seances').update({ nom: nouveau }).in('semaine_id', suivIds).eq('nom', ancien)
        : null,
    ].filter(Boolean))
    setSeances(prev => prev.map(s => s.id === seanceId ? { ...s, nom: nouveau } : s))
  }

  async function addCustomExo(muscle, nom) {
    if (!nom.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('exercices_custom').upsert({ coach_id: user.id, muscle, nom: nom.trim() })
    fetchCustomExos()
  }

  async function toggleBlocOption(field, value) {
    await supabase.from('blocs').update({ [field]: value }).eq('id', blocId)
    setBloc(b => ({ ...b, [field]: value }))
  }

  if (showCreateBloc || semaines.length === 0) {
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-6">
          <Link to={`/coach/athlete/${bloc?.athlete_id}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-semibold">{bloc?.name} — Créer le programme</h1>
        </div>
        <CreateBlocForm onSubmit={createBlocStructure} />
      </Layout>
    )
  }

  const hasSuiv = semaines.some(s => s.numero > (activeSemaine?.numero || 1))

  return (
    <Layout>
      {confirmDeleteSemaine && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold mb-2">Supprimer cette semaine ?</h3>
            <p className="text-sm text-gray-500 mb-5">Tous les exercices et séries seront supprimés définitivement.</p>
            <div className="flex gap-2">
              <button onClick={() => deleteSemaine(confirmDeleteSemaine)}
                className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium">Supprimer</button>
              <button onClick={() => setConfirmDeleteSemaine(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link to={`/coach/athlete/${bloc?.athlete_id}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-xl font-semibold flex-1">{bloc?.name} — Programme</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => toggleBlocOption('powerlifting', !bloc?.powerlifting)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bloc?.powerlifting ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            🏋️ Powerlifting
          </button>
          <button onClick={() => toggleBlocOption('show_charge_indicative', !bloc?.show_charge_indicative)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bloc?.show_charge_indicative ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            Charge indic.
          </button>
          <button onClick={() => toggleBlocOption('show_rpe', !bloc?.show_rpe)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bloc?.show_rpe ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            RPE
          </button>
        </div>
      </div>

      {hasSuiv && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
          ✏️ Modifications en S{activeSemaine?.numero} propagées sur S{activeSemaine?.numero + 1}→S{semaines[semaines.length - 1]?.numero} (sauf indications, RPE et charge)
        </div>
      )}

      {bloc?.powerlifting && bloc?.athlete_id && (
        <PowerliftingMaxEditor blocId={blocId} athleteId={bloc.athlete_id} />
      )}

      {/* Sélecteur semaines avec date_debut */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {semaines.map(s => (
          <div key={s.id} className="flex items-center">
            {/* Bouton semaine */}
            <button onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-l-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
              S{s.numero}
              {s.date_debut && (
                <span className={`ml-1 text-xs ${activeSemaine?.id === s.id ? 'opacity-70' : 'text-gray-400'}`}>
                  {new Date(s.date_debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </button>
            {/* Bouton date */}
            <button
              onClick={() => setEditingDateSemaine(editingDateSemaine === s.id ? null : s.id)}
              title="Définir la date de début"
              className={`px-1.5 py-1.5 text-xs border-t border-b transition-colors ${
                activeSemaine?.id === s.id
                  ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800'
                  : s.date_debut
                    ? 'bg-white border-gray-200 text-brand-400 hover:text-brand-600'
                    : 'bg-white border-gray-200 text-gray-300 hover:text-gray-500'
              }`}>
              📅
            </button>
            {/* Bouton supprimer */}
            <button onClick={() => setConfirmDeleteSemaine(s.id)}
              className={`px-2 py-1.5 rounded-r-lg text-sm border-t border-b border-r transition-colors ${activeSemaine?.id === s.id ? 'bg-brand-700 text-brand-200 border-brand-700' : 'bg-white border-gray-200 text-gray-300 hover:text-red-400'}`}>
              ×
            </button>
          </div>
        ))}
        <button onClick={addSemaine}
          className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-600">
          + Semaine
        </button>
      </div>

      {/* Popup inline date_debut */}
      {editingDateSemaine && (
        <div className="mb-4 bg-white border border-brand-200 rounded-xl p-4 flex items-center gap-4 flex-wrap shadow-sm">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">
              Date de début — S{semaines.find(s => s.id === editingDateSemaine)?.numero}
            </p>
            <p className="text-xs text-gray-400">
              Utilisée pour associer les données de tracking aux bons objectifs nutritionnels.
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              defaultValue={semaines.find(s => s.id === editingDateSemaine)?.date_debut || ''}
              onChange={e => {}}
              id="date-semaine-input"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={() => {
                const val = document.getElementById('date-semaine-input').value
                updateSemaineDate(editingDateSemaine, val)
              }}
              className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700">
              OK
            </button>
            <button onClick={() => setEditingDateSemaine(null)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-500">
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-6">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => (
            <SeanceEditor key={seance.id} seance={seance}
              showChargeIndicative={bloc?.show_charge_indicative}
              showRpe={bloc?.show_rpe}
              isPowerlifting={bloc?.powerlifting}
              getExosPourMuscle={getExosPourMuscle}
              onAddExercice={() => addExercice(seance.id, seance.nom)}
              onUpdateExercice={(id, f, v) => updateExercice(id, f, v, seance.nom)}
              onDeleteExercice={(id) => deleteExercice(id, seance.nom)}
              onReorderExercices={(from, to) => reorderExercices(seance.id, from, to)}
              onAddCustomExo={addCustomExo}
              onDeleteSeance={() => { supabase.from('seances').delete().eq('id', seance.id); fetchSeances(activeSemaine.id) }}
              onUpdateNom={(a, n) => updateSeanceNom(seance.id, a, n)}
            />
          ))}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <BonusEditor key={seance.id} seance={seance}
              onConfirmAdd={async (nom) => {
                if (!nom?.trim()) return
                const o = seances.find(s => s.id === seance.id)?.activites_bonus?.length || 0
                await supabase.from('activites_bonus').insert({ seance_id: seance.id, nom: nom.trim(), ordre: o })
                fetchSeances(activeSemaine.id)
              }}
              onUpdate={async (id, f, v) => supabase.from('activites_bonus').update({ [f]: v }).eq('id', id)}
              onDelete={async (id) => { await supabase.from('activites_bonus').delete().eq('id', id); fetchSeances(activeSemaine.id) }}
            />
          ))}
          <button
            onClick={async () => {
              const n = seances.filter(s => s.nom !== 'Bonus').length
              await supabase.from('seances').insert({ semaine_id: activeSemaine.id, nom: `Jour ${n + 1}`, ordre: n })
              fetchSeances(activeSemaine.id)
            }}
            className="w-full py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors">
            + Ajouter une séance à cette semaine
          </button>
        </div>
      )}
    </Layout>
  )
}

// ── CreateBlocForm ────────────────────────────────────────────────────
function CreateBlocForm({ onSubmit }) {
  const [nbSemaines, setNbSemaines]   = useState(4)
  const [nomsSeances, setNomsSeances] = useState(['Jour 1', 'Jour 2', 'Jour 3', 'Jour 4'])
  const [dateDebut, setDateDebut]     = useState('')
  const [saving, setSaving]           = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onSubmit({ nomsSeances: nomsSeances.filter(n => n.trim()), nbSemaines, dateDebut })
    setSaving(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 max-w-lg">
      <h2 className="text-base font-medium text-gray-800 mb-5">Structure du bloc</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nombre de semaines */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Nombre de semaines</label>
          <div className="flex gap-2 flex-wrap">
            {[2,3,4,5,6,8,10,12].map(n => (
              <button key={n} type="button" onClick={() => setNbSemaines(n)}
                className={`w-12 h-10 rounded-lg text-sm font-medium ${nbSemaines === n ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Date de début S1 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Date de début (S1)
            <span className="ml-1 text-xs text-gray-400 font-normal">— recommandé pour le suivi nutritionnel</span>
          </label>
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {dateDebut && (
            <p className="text-xs text-brand-600 mt-1">
              Les dates de S1 à S{nbSemaines} seront calculées automatiquement.
            </p>
          )}
        </div>

        {/* Séances */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Séances par semaine</label>
          <div className="space-y-2">
            {nomsSeances.map((nom, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={nom}
                  onChange={e => setNomsSeances(s => s.map((n, idx) => idx === i ? e.target.value : n))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {nomsSeances.length > 1 && (
                  <button type="button" onClick={() => setNomsSeances(s => s.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-400 text-lg">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setNomsSeances(s => [...s, `Jour ${s.length + 1}`])}
            className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium">
            + Ajouter une séance
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          Une séance <strong>Bonus</strong> sera ajoutée automatiquement.
        </div>

        <button type="submit" disabled={saving || nomsSeances.filter(n => n.trim()).length === 0}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Génération…' : `Générer ${nbSemaines} semaines →`}
        </button>
      </form>
    </div>
  )
}

// ── SeanceEditor ──────────────────────────────────────────────────────
function SeanceEditor({ seance, showChargeIndicative, showRpe, isPowerlifting, getExosPourMuscle, onAddExercice, onUpdateExercice, onDeleteExercice, onReorderExercices, onAddCustomExo, onDeleteSeance, onUpdateNom }) {
  const [editingNom, setEditingNom]       = useState(false)
  const [nom, setNom]                     = useState(seance.nom)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragFromIdx, setDragFromIdx]     = useState(null)
  const [dragOverIdx, setDragOverIdx]     = useState(null)

  function handleNomBlur() {
    if (nom.trim() && nom !== seance.nom) onUpdateNom(seance.nom, nom.trim())
    setEditingNom(false)
  }

  const sortedExos = (seance.exercices || []).sort((a, b) => a.ordre - b.ordre)

  const gridCols = 9
    + (showChargeIndicative ? 2 : 0)
    + (showRpe ? 1 : 0)
    + (isPowerlifting ? 2 : 0)

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        {editingNom ? (
          <input autoFocus value={nom} onChange={e => setNom(e.target.value)}
            onBlur={handleNomBlur} onKeyDown={e => e.key === 'Enter' && handleNomBlur()}
            className="flex-1 bg-white border border-brand-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-400 mr-4"
          />
        ) : (
          <button onClick={() => { setNom(seance.nom); setEditingNom(true) }}
            className="text-sm font-medium text-gray-800 hover:text-brand-600 group flex items-center gap-2">
            {seance.nom}
            <span className="text-xs text-gray-300 group-hover:text-brand-400">✎</span>
          </button>
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Supprimer ?</span>
            <button onClick={onDeleteSeance} className="text-red-500 font-medium">Oui</button>
            <button onClick={() => setConfirmDelete(false)} className="text-gray-400">Non</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-300 hover:text-red-400">Supprimer</button>
        )}
      </div>

      <div className="p-4 space-y-2">
        <div className="flex gap-1 text-xs text-gray-400 font-medium pl-6">
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
            <div className="col-span-2">Muscle</div>
            <div className="col-span-2">Exercice</div>
            <div className="text-center">Sets</div>
            <div>Reps</div>
            <div>Repos</div>
            {showChargeIndicative && <div className="col-span-2">Charge (kg)</div>}
            {showRpe && <div>RPE</div>}
            {isPowerlifting && <div className="col-span-2">Lift principal</div>}
            <div className="col-span-2">Indication</div>
          </div>
          <div className="w-5 flex-shrink-0" />
        </div>

        {sortedExos.map((ex, idx) => (
          <div key={ex.id}
            onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
            onDrop={() => { if (dragFromIdx !== null && dragFromIdx !== idx) onReorderExercices(dragFromIdx, idx); setDragFromIdx(null); setDragOverIdx(null) }}
            onDragLeave={() => setDragOverIdx(null)}
            className={`rounded-lg transition-all ${dragOverIdx === idx && dragFromIdx !== idx ? 'border-2 border-brand-400 bg-brand-50/30' : ''} ${dragFromIdx === idx ? 'opacity-40' : ''}`}>
            <div className="flex gap-1 items-start">
              <span draggable
                onDragStart={() => setDragFromIdx(idx)}
                onDragEnd={() => { setDragFromIdx(null); setDragOverIdx(null) }}
                className="cursor-grab active:cursor-grabbing text-gray-300 text-base leading-none mt-2.5 flex-shrink-0 select-none w-5 text-center"
                title="Glisser pour réordonner">⠿</span>
              <div className="flex-1 min-w-0">
                <ExerciceRow exercice={ex}
                  showChargeIndicative={showChargeIndicative} showRpe={showRpe} isPowerlifting={isPowerlifting}
                  gridCols={gridCols} getExosPourMuscle={getExosPourMuscle}
                  onUpdate={(f, v) => onUpdateExercice(ex.id, f, v)}
                  onDelete={() => onDeleteExercice(ex.id)}
                  onAddCustomExo={onAddCustomExo}
                />
              </div>
            </div>
          </div>
        ))}
        <button onClick={onAddExercice} className="mt-1 text-sm text-brand-600 hover:text-brand-800 font-medium pl-6">
          + Ajouter un exercice
        </button>
      </div>
    </div>
  )
}

// ── ExerciceRow ───────────────────────────────────────────────────────
function ExerciceRow({ exercice, showChargeIndicative, showRpe, isPowerlifting, gridCols, getExosPourMuscle, onUpdate, onDelete, onAddCustomExo }) {
  const [muscle, setMuscle]         = useState(exercice.muscle || '')
  const [nom, setNom]               = useState(exercice.nom || '')
  const [sets, setSets]             = useState(exercice.sets || 3)
  const [repRange, setRepRange]     = useState(exercice.rep_range || '8-10')
  const [repos, setRepos]           = useState(exercice.repos || "2'")
  const [charge, setCharge]         = useState(exercice.charge_indicative || '')
  const [rpe, setRpe]               = useState(exercice.rpe_cible || '')
  const [indication, setIndication] = useState(exercice.indications || '')
  const [unilateral, setUnilateral] = useState(exercice.unilateral || false)
  const [mainLift, setMainLift]     = useState(exercice.main_lift || '')
  const [addingExo, setAddingExo]   = useState(false)
  const [newExoName, setNewExoName] = useState('')

  const exosDispo = muscle ? getExosPourMuscle(muscle) : []

  function handleMuscleChange(v) { setMuscle(v); setNom(''); onUpdate('muscle', v); onUpdate('nom', '') }
  function handleNomChange(v) {
    if (v === '__new__') { setAddingExo(true); return }
    setNom(v); onUpdate('nom', v)
  }
  async function handleAddCustom() {
    if (!newExoName.trim() || !muscle) return
    await onAddCustomExo(muscle, newExoName)
    setNom(newExoName); onUpdate('nom', newExoName)
    setNewExoName(''); setAddingExo(false)
  }
  function toggleUnilateral() { const v = !unilateral; setUnilateral(v); onUpdate('unilateral', v) }

  const sel = "w-full border border-gray-100 rounded px-1.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50"

  return (
    <div className="py-1">
      <div className="flex gap-1 items-start">
        <div className="grid flex-1 gap-1 items-start" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
          <div className="col-span-2">
            <select value={muscle} onChange={e => handleMuscleChange(e.target.value)} className={sel}>
              <option value="">—</option>
              {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            {addingExo ? (
              <div className="flex gap-1">
                <input autoFocus value={newExoName} onChange={e => setNewExoName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
                  placeholder="Nom…"
                  className="flex-1 border border-brand-300 rounded px-2 py-1.5 text-sm focus:outline-none bg-white min-w-0"
                />
                <button onClick={handleAddCustom} className="text-brand-600 text-sm px-1">✓</button>
                <button onClick={() => setAddingExo(false)} className="text-gray-400 text-sm px-1">✕</button>
              </div>
            ) : (
              <select value={nom} onChange={e => handleNomChange(e.target.value)} className={sel} disabled={!muscle}>
                <option value="">— choisir</option>
                {exosDispo.map(e => <option key={e} value={e}>{e}</option>)}
                <option value="__new__">+ Ajouter…</option>
              </select>
            )}
          </div>
          <div>
            <input type="number" value={sets} min={1} max={10}
              onChange={e => setSets(e.target.value)} onBlur={() => onUpdate('sets', sets)}
              className={sel + " text-center"} />
          </div>
          <div>
            <input value={repRange} onChange={e => setRepRange(e.target.value)}
              onBlur={() => onUpdate('rep_range', repRange)} placeholder="8-10" className={sel} />
          </div>
          <div>
            <select value={repos} onChange={e => { setRepos(e.target.value); onUpdate('repos', e.target.value) }} className={sel}>
              {TEMPS_REPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {showChargeIndicative && (
            <div className="col-span-2 flex items-center gap-1">
              <input type="number" value={charge} onChange={e => setCharge(e.target.value)}
                onBlur={() => onUpdate('charge_indicative', charge)} placeholder="kg"
                className={sel + " flex-1"} />
              <button onClick={toggleUnilateral}
                className={`text-xs px-1.5 py-1.5 rounded border flex-shrink-0 transition-colors ${unilateral ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                ×2
              </button>
            </div>
          )}
          {showRpe && (
            <div>
              <input value={rpe} onChange={e => setRpe(e.target.value)}
                onBlur={() => onUpdate('rpe_cible', rpe)} placeholder="@8" className={sel} />
            </div>
          )}
          {isPowerlifting && (
            <div className="col-span-2">
              <select value={mainLift}
                onChange={e => { setMainLift(e.target.value); onUpdate('main_lift', e.target.value || null) }}
                className={sel}>
                <option value="">— aucun</option>
                <option value="squat">🏋️ Squat</option>
                <option value="bench">💪 Bench</option>
                <option value="deadlift">⚡ Deadlift</option>
              </select>
            </div>
          )}
          <div className="col-span-2">
            <textarea value={indication}
              onChange={e => setIndication(e.target.value)} onBlur={() => onUpdate('indications', indication)}
              placeholder="Note coach…" rows={1}
              className="w-full border border-gray-100 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-amber-50/30 resize-none overflow-hidden placeholder-gray-300"
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
            />
          </div>
        </div>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none mt-2 flex-shrink-0 w-5">×</button>
      </div>
      {!showChargeIndicative && (
        <div className="flex items-center gap-2 pl-0 mt-1">
          <button onClick={toggleUnilateral}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${unilateral ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-gray-300'}`}>
            {unilateral ? '✓ Unilatéral' : 'Unilatéral'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── BonusEditor ───────────────────────────────────────────────────────
function BonusEditor({ seance, onConfirmAdd, onUpdate, onDelete }) {
  const [activites, setActivites] = useState(seance.activites_bonus || [])
  const [editingId, setEditingId] = useState(null)
  const [editVal, setEditVal]     = useState('')
  const [adding, setAdding]       = useState(false)
  const [newNom, setNewNom]       = useState('')

  useEffect(() => { setActivites(seance.activites_bonus || []) }, [seance])

  async function saveEdit(id) {
    if (editVal.trim()) {
      await onUpdate(id, 'nom', editVal.trim())
      setActivites(prev => prev.map(a => a.id === id ? { ...a, nom: editVal.trim() } : a))
    }
    setEditingId(null)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-800">Activités bonus</h3>
        <button onClick={() => setAdding(true)} className="text-xs text-brand-600 hover:text-brand-800 font-medium">+ Ajouter</button>
      </div>
      <div className="p-4 space-y-2">
        {activites.sort((a, b) => a.ordre - b.ordre).map(act => (
          <div key={act.id} className="flex items-center gap-2">
            {editingId === act.id ? (
              <>
                <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                  onBlur={() => saveEdit(act.id)} onKeyDown={e => e.key === 'Enter' && saveEdit(act.id)}
                  className="flex-1 border border-brand-300 rounded px-2 py-1 text-sm focus:outline-none"
                />
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">Annuler</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700">{act.nom}</span>
                <button onClick={() => { setEditingId(act.id); setEditVal(act.nom) }} className="text-xs text-gray-400 hover:text-brand-500">✎</button>
                <button onClick={() => { onDelete(act.id); setActivites(prev => prev.filter(a => a.id !== act.id)) }} className="text-xs text-gray-300 hover:text-red-400">×</button>
              </>
            )}
          </div>
        ))}
        {adding && (
          <div className="flex gap-2 mt-1">
            <input autoFocus value={newNom} onChange={e => setNewNom(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onConfirmAdd(newNom); setNewNom(''); setAdding(false) }
                if (e.key === 'Escape') { setAdding(false); setNewNom('') }
              }}
              placeholder="Nom de l'activité…"
              className="flex-1 border border-brand-300 rounded px-2 py-1.5 text-sm focus:outline-none"
            />
            <button onClick={() => { onConfirmAdd(newNom); setNewNom(''); setAdding(false) }} className="text-brand-600 text-sm font-medium px-2">✓</button>
            <button onClick={() => { setAdding(false); setNewNom('') }} className="text-gray-400 text-sm px-1">✕</button>
          </div>
        )}
        {activites.length === 0 && !adding && (
          <p className="text-xs text-gray-400">Aucune activité. Clique sur + Ajouter.</p>
        )}
      </div>
    </div>
  )
}