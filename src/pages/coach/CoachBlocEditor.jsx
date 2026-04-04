import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import { MUSCLES, EXERCICES_PAR_MUSCLE, TEMPS_REPOS, BONUS_DEFAUT } from '../../lib/exercices'

export default function CoachBlocEditor() {
  const { blocId } = useParams()
  const [bloc, setBloc]                   = useState(null)
  const [semaines, setSemaines]           = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [showCreateBloc, setShowCreateBloc] = useState(false)
  const [customExos, setCustomExos]       = useState({})
  const [confirmDeleteSemaine, setConfirmDeleteSemaine] = useState(null)

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
    ;(data || []).forEach(ex => {
      if (!map[ex.muscle]) map[ex.muscle] = []
      map[ex.muscle].push(ex.nom)
    })
    setCustomExos(map)
  }

  function getExosPourMuscle(muscle) {
    const base   = EXERCICES_PAR_MUSCLE[muscle] || []
    const custom = customExos[muscle] || []
    return [...base, ...custom.filter(c => !base.includes(c))]
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    const { data } = await supabase
      .from('seances')
      .select('*, exercices(*), activites_bonus(*)')
      .eq('semaine_id', semaineId)
      .order('ordre')
    setSeances(data || [])
    setLoading(false)
  }

  async function createBlocStructure({ nomsSeances, nbSemaines }) {
    const semaineCrees = []
    for (let i = 1; i <= nbSemaines; i++) {
      const { data: sem } = await supabase
        .from('semaines')
        .insert({ bloc_id: blocId, numero: i })
        .select()
        .single()
      semaineCrees.push(sem)
    }
    for (let si = 0; si < semaineCrees.length; si++) {
      // Créer toutes les séances d'un coup
      const seancesPayload = nomsSeances.map((nom, j) => ({
        semaine_id: semaineCrees[si].id, nom, ordre: j
      }))
      seancesPayload.push({ semaine_id: semaineCrees[si].id, nom: 'Bonus', ordre: nomsSeances.length })
      const { data: newSeances } = await supabase.from('seances').insert(seancesPayload).select()
      // Ajouter les activités bonus en batch
      const bonusSeance = (newSeances || []).find(s => s.nom === 'Bonus')
      if (bonusSeance) {
        const bonusPayload = BONUS_DEFAUT.map((nom, k) => ({
          seance_id: bonusSeance.id, nom, ordre: k
        }))
        await supabase.from('activites_bonus').insert(bonusPayload)
      }
    }
    setSemaines(semaineCrees)
    setActiveSemaine(semaineCrees[0])
    setShowCreateBloc(false)
  }

  async function addSemaine() {
    const num = (semaines[semaines.length - 1]?.numero || 0) + 1
    const { data: newSem } = await supabase
      .from('semaines')
      .insert({ bloc_id: blocId, numero: num })
      .select()
      .single()

    if (semaines.length > 0) {
      const { data: seancesRef } = await supabase
        .from('seances')
        .select('*, exercices(*), activites_bonus(*)')
        .eq('semaine_id', semaines[0].id)
        .order('ordre')

      for (const sc of seancesRef || []) {
        const { data: newSc } = await supabase
          .from('seances')
          .insert({ semaine_id: newSem.id, nom: sc.nom, ordre: sc.ordre })
          .select()
          .single()

        // Inserts en batch (fix perfs)
        if (sc.exercices?.length) {
          await supabase.from('exercices').insert(
            sc.exercices.map(ex => ({
              seance_id: newSc.id, muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
              rep_range: ex.rep_range, repos: ex.repos, indications: ex.indications,
              charge_indicative: ex.charge_indicative, rpe_cible: ex.rpe_cible,
              unilateral: ex.unilateral, ordre: ex.ordre
            }))
          )
        }
        if (sc.activites_bonus?.length) {
          await supabase.from('activites_bonus').insert(
            sc.activites_bonus.map(act => ({
              seance_id: newSc.id, nom: act.nom, description: act.description, ordre: act.ordre
            }))
          )
        }
      }
    }
    setSemaines(s => [...s, newSem])
    setActiveSemaine(newSem)
  }

  async function deleteSemaine(semaineId) {
    await supabase.from('semaines').delete().eq('id', semaineId)
    const remaining = semaines.filter(s => s.id !== semaineId)
    // Renuméroter en batch (toujours séquentiel mais inévitable)
    for (let i = 0; i < remaining.length; i++) {
      await supabase.from('semaines').update({ numero: i + 1 }).eq('id', remaining[i].id)
      remaining[i] = { ...remaining[i], numero: i + 1 }
    }
    setSemaines(remaining)
    setActiveSemaine(remaining[remaining.length - 1] || null)
    setConfirmDeleteSemaine(null)
  }

  async function propagateFromCurrentSemaine(seanceNom, currentSemaineNumero) {
    const semainesSuivantes = semaines.filter(s => s.numero > currentSemaineNumero)
    if (!semainesSuivantes.length) return
    const seanceCourante = seances.find(s => s.nom === seanceNom)
    if (!seanceCourante) return
    const { data: exsCourants } = await supabase
      .from('exercices')
      .select('*')
      .eq('seance_id', seanceCourante.id)
      .order('ordre')

    for (const semSuivante of semainesSuivantes) {
      const { data: scSuivante } = await supabase
        .from('seances')
        .select('id')
        .eq('semaine_id', semSuivante.id)
        .eq('nom', seanceNom)
        .single()
      if (!scSuivante) continue

      const { data: exsExistants } = await supabase
        .from('exercices')
        .select('*')
        .eq('seance_id', scSuivante.id)
        .order('ordre')

      const existantsParOrdre = {}
      ;(exsExistants || []).forEach(e => { existantsParOrdre[e.ordre] = e })

      const ordresCourants = new Set((exsCourants || []).map(e => e.ordre))

      // UPDATE les exercices existants (préserve l'UUID → préserve series_realisees)
      for (const ex of exsCourants || []) {
        const cible = existantsParOrdre[ex.ordre]
        if (cible) {
          await supabase.from('exercices').update({
            muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
            rep_range: ex.rep_range, repos: ex.repos,
            charge_indicative: ex.charge_indicative,
            rpe_cible: ex.rpe_cible, unilateral: ex.unilateral,
            // indications propres à chaque semaine — on ne les écrase pas
          }).eq('id', cible.id)
        } else {
          // Nouvel exercice ajouté dans la semaine courante → INSERT dans les suivantes
          await supabase.from('exercices').insert({
            seance_id: scSuivante.id, muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
            rep_range: ex.rep_range, repos: ex.repos, charge_indicative: ex.charge_indicative,
            rpe_cible: ex.rpe_cible, unilateral: ex.unilateral, ordre: ex.ordre,
            indications: ex.indications,
          })
        }
      }

      // DELETE les exercices supprimés dans la semaine courante
      // On ne supprime QUE ceux dont l'ordre n'existe plus — sans toucher aux series_realisees
      // des exercices conservés (déjà gérés par UPDATE ci-dessus)
      const aSupprimer = (exsExistants || []).filter(e => !ordresCourants.has(e.ordre))
      if (aSupprimer.length) {
        await supabase.from('exercices')
          .delete()
          .in('id', aSupprimer.map(e => e.id))
      }
    }
  }

  async function addExercice(seanceId, seanceNom) {
    const seance = seances.find(s => s.id === seanceId)
    const ordre = seance?.exercices?.length || 0
    await supabase.from('exercices').insert({ seance_id: seanceId, nom: '', sets: 3, rep_range: '8-10', repos: "2'", ordre })
    await fetchSeances(activeSemaine.id)
    await propagateFromCurrentSemaine(seanceNom, activeSemaine.numero)
  }

  async function updateExercice(id, field, value, seanceNom) {
    await supabase.from('exercices').update({ [field]: value }).eq('id', id)
    if (field !== 'indications') {
      setSeances(prev => prev.map(sc => ({
        ...sc,
        exercices: (sc.exercices || []).map(ex => ex.id === id ? { ...ex, [field]: value } : ex)
      })))
      await propagateFromCurrentSemaine(seanceNom, activeSemaine.numero)
    }
  }

  async function deleteExercice(id, seanceNom) {
    await supabase.from('exercices').delete().eq('id', id)
    await fetchSeances(activeSemaine.id)
    await propagateFromCurrentSemaine(seanceNom, activeSemaine.numero)
  }

  async function updateSeanceNom(seanceId, ancienNom, nouveauNom) {
    await supabase.from('seances').update({ nom: nouveauNom }).eq('id', seanceId)
    setSeances(prev => prev.map(s => s.id === seanceId ? { ...s, nom: nouveauNom } : s))
    const semainesSuivantes = semaines.filter(s => s.numero > activeSemaine.numero)
    for (const sem of semainesSuivantes) {
      await supabase.from('seances').update({ nom: nouveauNom }).eq('semaine_id', sem.id).eq('nom', ancienNom)
    }
  }

  async function addCustomExo(muscle, nom) {
    if (!nom.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('exercices_custom').upsert({ coach_id: user.id, muscle, nom: nom.trim() })
    fetchCustomExos()
  }

  async function addSeanceToSemaine(semaineId) {
    const seancesActuelles = seances.filter(s => s.nom !== 'Bonus')
    await supabase.from('seances').insert({
      semaine_id: semaineId,
      nom: `Jour ${seancesActuelles.length + 1}`,
      ordre: seancesActuelles.length
    })
    fetchSeances(semaineId)
  }

  async function deleteSeance(seanceId) {
    await supabase.from('seances').delete().eq('id', seanceId)
    fetchSeances(activeSemaine.id)
  }

  async function addActiviteBonus(seanceId) {
    setSeances(prev => prev.map(s =>
      s.id === seanceId ? { ...s, _addingBonus: true } : s
    ))
  }

  async function confirmAddActiviteBonus(seanceId, nom) {
    if (!nom?.trim()) {
      setSeances(prev => prev.map(s => s.id === seanceId ? { ...s, _addingBonus: false } : s))
      return
    }
    const ordre = seances.find(s => s.id === seanceId)?.activites_bonus?.length || 0
    await supabase.from('activites_bonus').insert({ seance_id: seanceId, nom: nom.trim(), ordre })
    await fetchSeances(activeSemaine.id)
  }

  async function updateActiviteBonus(id, field, value) {
    await supabase.from('activites_bonus').update({ [field]: value }).eq('id', id)
  }

  async function deleteActiviteBonus(id) {
    await supabase.from('activites_bonus').delete().eq('id', id)
    fetchSeances(activeSemaine.id)
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

  const hasSemainesSuivantes = semaines.some(s => s.numero > (activeSemaine?.numero || 1))

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
        <div className="flex gap-2">
          <button
            onClick={() => toggleBlocOption('show_charge_indicative', !bloc?.show_charge_indicative)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bloc?.show_charge_indicative ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            Charge indic.
          </button>
          <button
            onClick={() => toggleBlocOption('show_rpe', !bloc?.show_rpe)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bloc?.show_rpe ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            RPE
          </button>
        </div>
      </div>

      {hasSemainesSuivantes && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
          ✏️ Modifications en S{activeSemaine?.numero} propagées sur S{activeSemaine?.numero + 1}→S{semaines[semaines.length - 1]?.numero} (sauf indications)
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {semaines.map(s => (
          <div key={s.id} className="flex items-center">
            <button onClick={() => setActiveSemaine(s)}
              className={`px-3 py-1.5 rounded-l-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
              S{s.numero}
            </button>
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

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-6">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => (
            <SeanceEditor key={seance.id} seance={seance}
              showChargeIndicative={bloc?.show_charge_indicative}
              showRpe={bloc?.show_rpe}
              getExosPourMuscle={getExosPourMuscle}
              onAddExercice={() => addExercice(seance.id, seance.nom)}
              onUpdateExercice={(id, field, val) => updateExercice(id, field, val, seance.nom)}
              onDeleteExercice={(id) => deleteExercice(id, seance.nom)}
              onAddCustomExo={addCustomExo}
              onDeleteSeance={() => deleteSeance(seance.id)}
              onUpdateNom={(ancien, nouveau) => updateSeanceNom(seance.id, ancien, nouveau)}
            />
          ))}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <BonusEditor key={seance.id} seance={seance}
              onAdd={() => addActiviteBonus(seance.id)}
              onConfirmAdd={(nom) => confirmAddActiviteBonus(seance.id, nom)}
              onUpdate={updateActiviteBonus}
              onDelete={deleteActiviteBonus}
            />
          ))}
          <button onClick={() => addSeanceToSemaine(activeSemaine.id)}
            className="w-full py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors">
            + Ajouter une séance à cette semaine
          </button>
        </div>
      )}
    </Layout>
  )
}

function CreateBlocForm({ onSubmit }) {
  const [nbSemaines, setNbSemaines]   = useState(4)
  const [nomsSeances, setNomsSeances] = useState(['Jour 1', 'Jour 2', 'Jour 3', 'Jour 4'])
  const [saving, setSaving]           = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onSubmit({ nomsSeances: nomsSeances.filter(n => n.trim()), nbSemaines })
    setSaving(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 max-w-lg">
      <h2 className="text-base font-medium text-gray-800 mb-5">Structure du bloc</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Nombre de semaines</label>
          <div className="flex gap-2 flex-wrap">
            {[2, 3, 4, 5, 6, 8, 10, 12].map(n => (
              <button key={n} type="button" onClick={() => setNbSemaines(n)}
                className={`w-12 h-10 rounded-lg text-sm font-medium ${nbSemaines === n ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Séances par semaine</label>
          <p className="text-xs text-gray-400 mb-3">Modifie S1 pour propager sur S2, S3…</p>
          <div className="space-y-2">
            {nomsSeances.map((nom, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={nom}
                  onChange={e => setNomsSeances(s => s.map((n, idx) => idx === i ? e.target.value : n))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {nomsSeances.length > 1 && (
                  <button type="button"
                    onClick={() => setNomsSeances(s => s.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-400 text-lg">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => setNomsSeances(s => [...s, `Jour ${s.length + 1}`])}
            className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium">
            + Ajouter une séance
          </button>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          Une séance <strong>Bonus</strong> sera ajoutée automatiquement.
        </div>
        <button type="submit"
          disabled={saving || nomsSeances.filter(n => n.trim()).length === 0}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Génération…' : `Générer ${nbSemaines} semaines →`}
        </button>
      </form>
    </div>
  )
}

function SeanceEditor({ seance, showChargeIndicative, showRpe, getExosPourMuscle, onAddExercice, onUpdateExercice, onDeleteExercice, onAddCustomExo, onDeleteSeance, onUpdateNom }) {
  const [editingNom, setEditingNom]   = useState(false)
  const [nom, setNom]                 = useState(seance.nom)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleNomBlur() {
    if (nom.trim() && nom !== seance.nom) onUpdateNom(seance.nom, nom.trim())
    setEditingNom(false)
  }

  const totalCols = 10 + (showChargeIndicative ? 1 : 0) + (showRpe ? 1 : 0)

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        {editingNom ? (
          <input autoFocus value={nom}
            onChange={e => setNom(e.target.value)}
            onBlur={handleNomBlur}
            onKeyDown={e => e.key === 'Enter' && handleNomBlur()}
            className="flex-1 bg-white border border-brand-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-400 mr-4"
          />
        ) : (
          <button onClick={() => { setNom(seance.nom); setEditingNom(true) }}
            className="text-sm font-medium text-gray-800 hover:text-brand-600 group flex items-center gap-2">
            {seance.nom}<span className="text-xs text-gray-300 group-hover:text-brand-400">✎</span>
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
      <div className="p-4 space-y-3">
        <div className="grid gap-2 px-1 text-xs text-gray-400 font-medium"
          style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>
          <div className="col-span-2">Muscle</div>
          <div className="col-span-2">Exercice</div>
          <div className="text-center">Sets</div>
          <div>Reps</div>
          <div>Repos</div>
          {showChargeIndicative && <div>Charge</div>}
          {showRpe && <div>RPE</div>}
          <div className="col-span-2">Indication</div>
        </div>
        {(seance.exercices || []).sort((a, b) => a.ordre - b.ordre).map(ex => (
          <ExerciceRow key={ex.id} exercice={ex}
            showChargeIndicative={showChargeIndicative}
            showRpe={showRpe}
            totalCols={totalCols}
            getExosPourMuscle={getExosPourMuscle}
            onUpdate={(field, val) => onUpdateExercice(ex.id, field, val)}
            onDelete={() => onDeleteExercice(ex.id)}
            onAddCustomExo={onAddCustomExo}
          />
        ))}
        <button onClick={onAddExercice} className="mt-1 text-sm text-brand-600 hover:text-brand-800 font-medium">
          + Ajouter un exercice
        </button>
      </div>
    </div>
  )
}

function ExerciceRow({ exercice, showChargeIndicative, showRpe, totalCols, getExosPourMuscle, onUpdate, onDelete, onAddCustomExo }) {
  const [muscle, setMuscle]                     = useState(exercice.muscle || '')
  const [nom, setNom]                           = useState(exercice.nom || '')
  const [sets, setSets]                         = useState(exercice.sets || 3)
  const [repRange, setRepRange]                 = useState(exercice.rep_range || '8-10')
  const [repos, setRepos]                       = useState(exercice.repos || "2'")
  const [chargeIndicative, setChargeIndicative] = useState(exercice.charge_indicative || '')
  const [rpe, setRpe]                           = useState(exercice.rpe_cible || '')
  const [indication, setIndication]             = useState(exercice.indications || '')
  const [unilateral, setUnilateral]             = useState(exercice.unilateral || false)
  const [addingExo, setAddingExo]               = useState(false)
  const [newExoName, setNewExoName]             = useState('')

  const exosDispo = muscle ? getExosPourMuscle(muscle) : []

  function handleMuscleChange(val) {
    setMuscle(val); setNom('')
    onUpdate('muscle', val); onUpdate('nom', '')
  }

  function handleNomChange(val) {
    if (val === '__new__') { setAddingExo(true); return }
    setNom(val); onUpdate('nom', val)
  }

  async function handleAddCustom() {
    if (!newExoName.trim() || !muscle) return
    await onAddCustomExo(muscle, newExoName)
    setNom(newExoName); onUpdate('nom', newExoName)
    setNewExoName(''); setAddingExo(false)
  }

  function toggleUnilateral() {
    const newVal = !unilateral
    setUnilateral(newVal)
    onUpdate('unilateral', newVal)
  }

  const sel = "w-full border border-gray-100 rounded px-1.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50"

  return (
    <div className="space-y-1.5">
      <div className="grid gap-2 items-start" style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>
        <div className="col-span-2">
          <select value={muscle} onChange={e => handleMuscleChange(e.target.value)} className={sel}>
            <option value="">—</option>
            {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          {addingExo ? (
            <div className="flex gap-1">
              <input autoFocus value={newExoName}
                onChange={e => setNewExoName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
                placeholder="Nom…"
                className="flex-1 border border-brand-300 rounded px-2 py-1.5 text-sm focus:outline-none bg-white"
              />
              <button onClick={handleAddCustom} className="text-brand-600 text-sm font-medium px-1">✓</button>
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
            onChange={e => setSets(e.target.value)}
            onBlur={() => onUpdate('sets', sets)}
            className={sel + " text-center"}
          />
        </div>
        <div>
          <input value={repRange}
            onChange={e => setRepRange(e.target.value)}
            onBlur={() => onUpdate('rep_range', repRange)}
            placeholder="8-10" className={sel}
          />
        </div>
        <div>
          <select value={repos} onChange={e => { setRepos(e.target.value); onUpdate('repos', e.target.value) }} className={sel}>
            {TEMPS_REPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {showChargeIndicative && (
          <div className="flex items-center gap-1">
            <input type="number" value={chargeIndicative}
              onChange={e => setChargeIndicative(e.target.value)}
              onBlur={() => onUpdate('charge_indicative', chargeIndicative)}
              placeholder="kg" className={sel}
            />
            <button onClick={toggleUnilateral} title="Unilatéral (×2 pour tonnage)"
              className={`text-xs px-1 py-1.5 rounded border transition-colors flex-shrink-0 ${unilateral ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
              ×2
            </button>
          </div>
        )}
        {showRpe && (
          <input value={rpe}
            onChange={e => setRpe(e.target.value)}
            onBlur={() => onUpdate('rpe_cible', rpe)}
            placeholder="@8" className={sel}
          />
        )}
        <div className="col-span-2 flex items-start gap-1">
          <textarea value={indication}
            onChange={e => setIndication(e.target.value)}
            onBlur={() => onUpdate('indications', indication)}
            placeholder="Note coach…" rows={1}
            className="flex-1 border border-gray-100 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-amber-50/30 resize-none overflow-hidden placeholder-gray-300"
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
          />
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none mt-0.5 flex-shrink-0">×</button>
        </div>
      </div>
      {!showChargeIndicative && (
        <div className="flex items-center gap-2">
          <button onClick={toggleUnilateral}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${unilateral ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-gray-300'}`}>
            {unilateral ? '✓ Unilatéral' : 'Unilatéral'}
          </button>
        </div>
      )}
    </div>
  )
}

// BonusEditor avec input inline (remplace window.prompt)
function BonusEditor({ seance, onAdd, onConfirmAdd, onUpdate, onDelete }) {
  const [activites, setActivites]   = useState(seance.activites_bonus || [])
  const [editingId, setEditingId]   = useState(null)
  const [editVal, setEditVal]       = useState('')
  const [adding, setAdding]         = useState(false)
  const [newNom, setNewNom]         = useState('')

  useEffect(() => { setActivites(seance.activites_bonus || []) }, [seance])

  function startEdit(act) { setEditingId(act.id); setEditVal(act.nom) }

  async function saveEdit(id) {
    if (editVal.trim()) {
      await onUpdate(id, 'nom', editVal.trim())
      setActivites(prev => prev.map(a => a.id === id ? { ...a, nom: editVal.trim() } : a))
    }
    setEditingId(null)
  }

  async function handleAdd() {
    await onConfirmAdd(newNom)
    setNewNom('')
    setAdding(false)
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
                <input autoFocus value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => saveEdit(act.id)}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(act.id)}
                  className="flex-1 border border-brand-300 rounded px-2 py-1 text-sm focus:outline-none"
                />
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">Annuler</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700">{act.nom}</span>
                <button onClick={() => startEdit(act)} className="text-xs text-gray-400 hover:text-brand-500">✎</button>
                <button
                  onClick={() => { onDelete(act.id); setActivites(prev => prev.filter(a => a.id !== act.id)) }}
                  className="text-xs text-gray-300 hover:text-red-400">×</button>
              </>
            )}
          </div>
        ))}
        {adding && (
          <div className="flex gap-2 mt-1">
            <input autoFocus value={newNom}
              onChange={e => setNewNom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewNom('') } }}
              placeholder="Nom de l'activité…"
              className="flex-1 border border-brand-300 rounded px-2 py-1.5 text-sm focus:outline-none"
            />
            <button onClick={handleAdd} className="text-brand-600 text-sm font-medium px-2">✓</button>
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
