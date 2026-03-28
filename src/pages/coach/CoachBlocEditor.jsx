import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import { MUSCLES, EXERCICES_PAR_MUSCLE, TEMPS_REPOS, BONUS_DEFAUT } from '../../lib/exercices'

export default function CoachBlocEditor() {
  const { blocId } = useParams()
  const [bloc, setBloc]                 = useState(null)
  const [semaines, setSemaines]         = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [showCreateBloc, setShowCreateBloc] = useState(false)
  const [customExos, setCustomExos]     = useState({})
  const [confirmDeleteSemaine, setConfirmDeleteSemaine] = useState(null)

  useEffect(() => { fetchBloc() }, [blocId])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBloc() {
    const { data: b } = await supabase.from('blocs').select('*').eq('id', blocId).single()
    setBloc(b)
    const { data: s } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(s || [])
    if (s && s.length > 0) setActiveSemaine(s[0])
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
    const base = EXERCICES_PAR_MUSCLE[muscle] || []
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
      const { data: sem } = await supabase.from('semaines')
        .insert({ bloc_id: blocId, numero: i }).select().single()
      semaineCrees.push(sem)
    }
    // Créer les séances identiques pour chaque semaine
    for (let si = 0; si < semaineCrees.length; si++) {
      for (let j = 0; j < nomsSeances.length; j++) {
        await supabase.from('seances').insert({ semaine_id: semaineCrees[si].id, nom: nomsSeances[j], ordre: j })
      }
      const { data: bonus } = await supabase.from('seances')
        .insert({ semaine_id: semaineCrees[si].id, nom: 'Bonus', ordre: nomsSeances.length }).select().single()
      for (let k = 0; k < BONUS_DEFAUT.length; k++) {
        await supabase.from('activites_bonus').insert({ seance_id: bonus.id, nom: BONUS_DEFAUT[k], ordre: k })
      }
    }
    setSemaines(semaineCrees)
    setActiveSemaine(semaineCrees[0])
    setShowCreateBloc(false)
  }

  async function addSemaine() {
    const num = (semaines[semaines.length - 1]?.numero || 0) + 1
    const { data: newSem } = await supabase.from('semaines')
      .insert({ bloc_id: blocId, numero: num }).select().single()

    // Copier la structure de la semaine 1
    if (semaines.length > 0) {
      const { data: seancesRef } = await supabase
        .from('seances').select('*, exercices(*), activites_bonus(*)')
        .eq('semaine_id', semaines[0].id).order('ordre')
      for (const sc of seancesRef || []) {
        const { data: newSc } = await supabase.from('seances')
          .insert({ semaine_id: newSem.id, nom: sc.nom, ordre: sc.ordre }).select().single()
        for (const ex of sc.exercices || []) {
          await supabase.from('exercices').insert({
            seance_id: newSc.id, muscle: ex.muscle, nom: ex.nom,
            sets: ex.sets, rep_range: ex.rep_range, repos: ex.repos,
            indications: ex.indications, ordre: ex.ordre
          })
        }
        for (const act of sc.activites_bonus || []) {
          await supabase.from('activites_bonus').insert({ seance_id: newSc.id, nom: act.nom, ordre: act.ordre })
        }
      }
    }
    setSemaines(s => [...s, newSem])
    setActiveSemaine(newSem)
  }

  async function deleteSemaine(semaineId) {
    await supabase.from('semaines').delete().eq('id', semaineId)
    const remaining = semaines.filter(s => s.id !== semaineId)
    for (let i = 0; i < remaining.length; i++) {
      await supabase.from('semaines').update({ numero: i + 1 }).eq('id', remaining[i].id)
      remaining[i] = { ...remaining[i], numero: i + 1 }
    }
    setSemaines(remaining)
    setActiveSemaine(remaining[remaining.length - 1] || null)
    setConfirmDeleteSemaine(null)
  }

  // Propage les exercices de S1 vers toutes les autres semaines (même séance par nom)
  async function propagateS1ToOtherSemaines(seanceNom) {
    const s1 = semaines.find(s => s.numero === 1)
    if (!s1 || activeSemaine?.numero !== 1) return

    const { data: seanceS1 } = await supabase
      .from('seances').select('id').eq('semaine_id', s1.id).eq('nom', seanceNom).single()
    if (!seanceS1) return

    const { data: exsS1 } = await supabase
      .from('exercices').select('*').eq('seance_id', seanceS1.id).order('ordre')

    const autresSemaines = semaines.filter(s => s.numero !== 1)
    for (const sem of autresSemaines) {
      const { data: scAutre } = await supabase
        .from('seances').select('id').eq('semaine_id', sem.id).eq('nom', seanceNom).single()
      if (!scAutre) continue
      await supabase.from('exercices').delete().eq('seance_id', scAutre.id)
      for (const ex of exsS1 || []) {
        await supabase.from('exercices').insert({
          seance_id: scAutre.id, muscle: ex.muscle, nom: ex.nom,
          sets: ex.sets, rep_range: ex.rep_range, repos: ex.repos,
          indications: ex.indications, ordre: ex.ordre
        })
      }
    }
  }

  async function addExercice(seanceId, seanceNom) {
    const seance = seances.find(s => s.id === seanceId)
    const ordre = (seance?.exercices?.length || 0)
    await supabase.from('exercices').insert({
      seance_id: seanceId, nom: '', sets: 3, rep_range: '8-10', repos: "2'", ordre
    })
    await fetchSeances(activeSemaine.id)
    if (activeSemaine?.numero === 1) await propagateS1ToOtherSemaines(seanceNom)
  }

  async function updateExercice(id, field, value, seanceNom) {
    await supabase.from('exercices').update({ [field]: value }).eq('id', id)
    if (activeSemaine?.numero === 1) {
      // Mise à jour dans les autres semaines aussi
      const s1 = semaines.find(s => s.numero === 1)
      if (!s1) return
      const { data: seanceS1 } = await supabase
        .from('seances').select('id').eq('semaine_id', s1.id).eq('nom', seanceNom).single()
      if (!seanceS1) return
      const { data: exsS1 } = await supabase
        .from('exercices').select('*').eq('seance_id', seanceS1.id).order('ordre')
      const exUpdated = exsS1?.find(e => e.id === id)
      if (!exUpdated) return
      const autresSemaines = semaines.filter(s => s.numero !== 1)
      for (const sem of autresSemaines) {
        const { data: scAutre } = await supabase
          .from('seances').select('id').eq('semaine_id', sem.id).eq('nom', seanceNom).single()
        if (!scAutre) continue
        const { data: exAutre } = await supabase
          .from('exercices').select('*').eq('seance_id', scAutre.id).eq('ordre', exUpdated.ordre).single()
        if (exAutre) await supabase.from('exercices').update({ [field]: value }).eq('id', exAutre.id)
      }
    }
  }

  async function deleteExercice(id, seanceNom) {
    await supabase.from('exercices').delete().eq('id', id)
    await fetchSeances(activeSemaine.id)
    if (activeSemaine?.numero === 1) await propagateS1ToOtherSemaines(seanceNom)
  }

  async function updateSeanceNom(seanceId, nom) {
    await supabase.from('seances').update({ nom }).eq('id', seanceId)
    setSeances(prev => prev.map(s => s.id === seanceId ? { ...s, nom } : s))
  }

  async function addCustomExo(muscle, nom) {
    if (!nom.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('exercices_custom').upsert({ coach_id: user.id, muscle, nom: nom.trim() })
    fetchCustomExos()
  }

  async function addSeanceToSemaine(semaineId) {
    const seancesActuelles = seances.filter(s => s.nom !== 'Bonus')
    const ordre = seancesActuelles.length
    await supabase.from('seances').insert({ semaine_id: semaineId, nom: `Jour ${ordre + 1}`, ordre })
    fetchSeances(semaineId)
  }

  async function deleteSeance(seanceId) {
    await supabase.from('seances').delete().eq('id', seanceId)
    fetchSeances(activeSemaine.id)
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

  return (
    <Layout>
      {confirmDeleteSemaine && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold mb-2">Supprimer cette semaine ?</h3>
            <p className="text-sm text-gray-500 mb-5">Tous les exercices et séries réalisées seront supprimés définitivement.</p>
            <div className="flex gap-2">
              <button onClick={() => deleteSemaine(confirmDeleteSemaine)} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600">Supprimer</button>
              <button onClick={() => setConfirmDeleteSemaine(null)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Link to={`/coach/athlete/${bloc?.athlete_id}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-xl font-semibold">{bloc?.name} — Programme</h1>
      </div>

      {activeSemaine?.numero === 1 && semaines.length > 1 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
          ✏️ Vous éditez la <strong>Semaine 1</strong> — les modifications se propagent automatiquement sur toutes les autres semaines.
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
              className={`px-2 py-1.5 rounded-r-lg text-sm border-t border-b border-r transition-colors ${activeSemaine?.id === s.id ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800' : 'bg-white border-gray-200 text-gray-300 hover:text-red-400 hover:border-red-200'}`}>
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
              getExosPourMuscle={getExosPourMuscle}
              onAddExercice={() => addExercice(seance.id, seance.nom)}
              onUpdateExercice={(id, field, val) => updateExercice(id, field, val, seance.nom)}
              onDeleteExercice={(id) => deleteExercice(id, seance.nom)}
              onAddCustomExo={addCustomExo}
              onDeleteSeance={() => deleteSeance(seance.id)}
              onUpdateNom={(nom) => updateSeanceNom(seance.id, nom)}
            />
          ))}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <BonusEditor key={seance.id} seance={seance} />
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
  const [nbSemaines, setNbSemaines] = useState(4)
  const [nomsSeances, setNomsSeances] = useState(['Jour 1', 'Jour 2', 'Jour 3', 'Jour 4'])
  const [saving, setSaving] = useState(false)

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
                className={`w-12 h-10 rounded-lg text-sm font-medium transition-colors ${nbSemaines === n ? 'bg-brand-600 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Séances par semaine</label>
          <p className="text-xs text-gray-400 mb-3">La structure sera identique pour toutes les semaines. Modifie les exercices en S1 pour les propager automatiquement.</p>
          <div className="space-y-2">
            {nomsSeances.map((nom, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={nom}
                  onChange={e => setNomsSeances(s => s.map((n, idx) => idx === i ? e.target.value : n))}
                  placeholder={`Jour ${i + 1}`}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
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
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? 'Génération…' : `Générer ${nbSemaines} semaines →`}
        </button>
      </form>
    </div>
  )
}

function SeanceEditor({ seance, getExosPourMuscle, onAddExercice, onUpdateExercice, onDeleteExercice, onAddCustomExo, onDeleteSeance, onUpdateNom }) {
  const [editingNom, setEditingNom] = useState(false)
  const [nom, setNom]               = useState(seance.nom)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleNomBlur() {
    if (nom.trim() && nom !== seance.nom) onUpdateNom(nom.trim())
    setEditingNom(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        {editingNom ? (
          <input autoFocus value={nom} onChange={e => setNom(e.target.value)}
            onBlur={handleNomBlur} onKeyDown={e => e.key === 'Enter' && handleNomBlur()}
            className="flex-1 bg-white border border-brand-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-400 mr-4" />
        ) : (
          <button onClick={() => setEditingNom(true)}
            className="text-sm font-medium text-gray-800 hover:text-brand-600 transition-colors text-left group flex items-center gap-2">
            {seance.nom}
            <span className="text-xs text-gray-300 group-hover:text-brand-400">✎</span>
          </button>
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Supprimer ?</span>
            <button onClick={onDeleteSeance} className="text-red-500 font-medium hover:text-red-700">Oui</button>
            <button onClick={() => setConfirmDelete(false)} className="text-gray-400">Non</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">Supprimer</button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* En-têtes */}
        <div className="grid grid-cols-12 gap-2 px-1 text-xs text-gray-400 font-medium">
          <div className="col-span-2">Muscle</div>
          <div className="col-span-3">Exercice</div>
          <div className="col-span-1 text-center">Sets</div>
          <div className="col-span-2">Reps</div>
          <div className="col-span-2">Repos</div>
          <div className="col-span-2">Indication</div>
        </div>

        {(seance.exercices || []).sort((a, b) => a.ordre - b.ordre).map(ex => (
          <ExerciceRow key={ex.id} exercice={ex}
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

function ExerciceRow({ exercice, getExosPourMuscle, onUpdate, onDelete, onAddCustomExo }) {
  const [muscle, setMuscle]         = useState(exercice.muscle || '')
  const [nom, setNom]               = useState(exercice.nom || '')
  const [sets, setSets]             = useState(exercice.sets || 3)
  const [repRange, setRepRange]     = useState(exercice.rep_range || '8-10')
  const [repos, setRepos]           = useState(exercice.repos || "2'")
  const [indication, setIndication] = useState(exercice.indications || '')
  const [addingExo, setAddingExo]   = useState(false)
  const [newExoName, setNewExoName] = useState('')

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

  const sel = "w-full border border-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50"

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-12 gap-2 items-start">
        {/* Muscle */}
        <div className="col-span-2">
          <select value={muscle} onChange={e => handleMuscleChange(e.target.value)} className={sel}>
            <option value="">—</option>
            {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Exercice */}
        <div className="col-span-3">
          {addingExo ? (
            <div className="flex gap-1">
              <input autoFocus value={newExoName} onChange={e => setNewExoName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustom()} placeholder="Nom…"
                className="flex-1 border border-brand-300 rounded px-2 py-1.5 text-sm focus:outline-none bg-white" />
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

        {/* Sets */}
        <div className="col-span-1">
          <input type="number" value={sets} min={1} max={10}
            onChange={e => setSets(e.target.value)} onBlur={() => onUpdate('sets', sets)}
            className={sel + " text-center"} />
        </div>

        {/* Rep range */}
        <div className="col-span-2">
          <input value={repRange} onChange={e => setRepRange(e.target.value)}
            onBlur={() => onUpdate('rep_range', repRange)} placeholder="8-10" className={sel} />
        </div>

        {/* Repos */}
        <div className="col-span-2">
          <select value={repos} onChange={e => { setRepos(e.target.value); onUpdate('repos', e.target.value) }} className={sel}>
            {TEMPS_REPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Supprimer */}
        <div className="col-span-1 flex justify-center pt-1">
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
        </div>
      </div>

      {/* Indication — ligne séparée pleine largeur */}
      <div className="pl-0">
        <textarea
          value={indication}
          onChange={e => setIndication(e.target.value)}
          onBlur={() => onUpdate('indications', indication)}
          placeholder="Indication / note coach (ex: garder les coudes serrés, augmenter charge si 10 reps faciles…)"
          rows={1}
          className="w-full border border-gray-100 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50 resize-none overflow-hidden placeholder-gray-300"
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
        />
      </div>
    </div>
  )
}

function BonusEditor({ seance }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-medium text-gray-800">Activités bonus</h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {(seance.activites_bonus || []).sort((a, b) => a.ordre - b.ordre).map(act => (
          <span key={act.id} className="bg-brand-50 text-brand-700 text-xs px-3 py-1.5 rounded-full font-medium">
            {act.nom}
          </span>
        ))}
      </div>
    </div>
  )
}
