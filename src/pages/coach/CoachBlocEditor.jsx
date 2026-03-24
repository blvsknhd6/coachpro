import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import { MUSCLES, EXERCICES_PAR_MUSCLE, TEMPS_REPOS, BONUS_DEFAUT } from '../../lib/exercices'

export default function CoachBlocEditor() {
  const { blocId } = useParams()
  const [bloc, setBloc]           = useState(null)
  const [semaines, setSemaines]   = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreateBloc, setShowCreateBloc] = useState(false)
  const [customExos, setCustomExos] = useState({})

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
    // Crée toutes les semaines d'un coup, puis copie les séances/exercices de S1 sur toutes
    const semaineCrees = []
    for (let i = 1; i <= nbSemaines; i++) {
      const { data: sem } = await supabase.from('semaines').insert({ bloc_id: blocId, numero: i }).select().single()
      semaineCrees.push(sem)
    }

    // Créer les séances pour la semaine 1 (template)
    const seanceIds = []
    for (let j = 0; j < nomsSeances.length; j++) {
      const { data: sc } = await supabase.from('seances').insert({ semaine_id: semaineCrees[0].id, nom: nomsSeances[j], ordre: j }).select().single()
      seanceIds.push(sc.id)
    }
    // Séance bonus
    const { data: bonus } = await supabase.from('seances').insert({ semaine_id: semaineCrees[0].id, nom: 'Bonus', ordre: nomsSeances.length }).select().single()
    for (let k = 0; k < BONUS_DEFAUT.length; k++) {
      await supabase.from('activites_bonus').insert({ seance_id: bonus.id, nom: BONUS_DEFAUT[k], ordre: k })
    }

    // Copier la structure S1 sur les semaines suivantes
    for (let si = 1; si < semaineCrees.length; si++) {
      for (let j = 0; j < nomsSeances.length; j++) {
        await supabase.from('seances').insert({ semaine_id: semaineCrees[si].id, nom: nomsSeances[j], ordre: j })
      }
      const { data: bonusCopy } = await supabase.from('seances').insert({ semaine_id: semaineCrees[si].id, nom: 'Bonus', ordre: nomsSeances.length }).select().single()
      for (let k = 0; k < BONUS_DEFAUT.length; k++) {
        await supabase.from('activites_bonus').insert({ seance_id: bonusCopy.id, nom: BONUS_DEFAUT[k], ordre: k })
      }
    }

    setSemaines(semaineCrees)
    setActiveSemaine(semaineCrees[0])
    setShowCreateBloc(false)
  }

  async function addSemaine() {
    // Récupère la structure de la dernière semaine et la copie
    const num = (semaines[semaines.length - 1]?.numero || 0) + 1
    const { data: newSem } = await supabase.from('semaines').insert({ bloc_id: blocId, numero: num }).select().single()

    if (semaines.length > 0) {
      // Copier séances de la semaine 1
      const { data: seancesRef } = await supabase
        .from('seances')
        .select('*, exercices(*), activites_bonus(*)')
        .eq('semaine_id', semaines[0].id)
        .order('ordre')

      for (const sc of seancesRef || []) {
        const { data: newSc } = await supabase.from('seances').insert({ semaine_id: newSem.id, nom: sc.nom, ordre: sc.ordre }).select().single()
        for (const ex of sc.exercices || []) {
          await supabase.from('exercices').insert({
            seance_id: newSc.id, muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
            rep_range: ex.rep_range, repos: ex.repos, indications: ex.indications, ordre: ex.ordre
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

  async function addExercice(seanceId) {
    const seance = seances.find(s => s.id === seanceId)
    const ordre = (seance?.exercices?.length || 0)
    await supabase.from('exercices').insert({ seance_id: seanceId, nom: '', sets: 3, rep_range: '8-10', repos: "2'", ordre })
    fetchSeances(activeSemaine.id)
  }

  async function updateExercice(id, field, value) {
    await supabase.from('exercices').update({ [field]: value }).eq('id', id)
  }

  async function deleteExercice(id) {
    await supabase.from('exercices').delete().eq('id', id)
    fetchSeances(activeSemaine.id)
  }

  async function addCustomExo(muscle, nom) {
    if (!nom.trim()) return
    await supabase.from('exercices_custom').upsert({ coach_id: (await supabase.auth.getUser()).data.user.id, muscle, nom: nom.trim() })
    fetchCustomExos()
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
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/coach/athlete/${bloc?.athlete_id}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-xl font-semibold">{bloc?.name} — Programme</h1>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {semaines.map(s => (
          <button key={s.id} onClick={() => setActiveSemaine(s)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${activeSemaine?.id === s.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
            Semaine {s.numero}
          </button>
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
              onAddExercice={() => addExercice(seance.id)}
              onUpdateExercice={updateExercice}
              onDeleteExercice={deleteExercice}
              onAddCustomExo={addCustomExo}
            />
          ))}
          {seances.filter(s => s.nom === 'Bonus').map(seance => (
            <BonusEditor key={seance.id} seance={seance} />
          ))}
        </div>
      )}
    </Layout>
  )
}

function CreateBlocForm({ onSubmit }) {
  const [nbSemaines, setNbSemaines] = useState(4)
  const [nomsSeances, setNomsSeances] = useState(['Jour 1', 'Jour 2', 'Jour 3', 'Jour 4'])
  const [saving, setSaving] = useState(false)

  function addSeance() { setNomsSeances(s => [...s, `Jour ${s.length + 1}`]) }
  function removeSeance(i) { setNomsSeances(s => s.filter((_, idx) => idx !== i)) }
  function updateNom(i, val) { setNomsSeances(s => s.map((n, idx) => idx === i ? val : n)) }

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
          <p className="text-xs text-gray-400 mb-3">La structure sera identique pour chaque semaine. Tu pourras modifier les exercices après.</p>
          <div className="space-y-2">
            {nomsSeances.map((nom, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={nom}
                  onChange={e => updateNom(i, e.target.value)}
                  placeholder={`Jour ${i + 1}`}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {nomsSeances.length > 1 && (
                  <button type="button" onClick={() => removeSeance(i)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addSeance}
            className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium">
            + Ajouter une séance
          </button>
        </div>

        <div className="pt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          Une séance <strong>Bonus</strong> (abdos, cardio, etc.) sera ajoutée automatiquement.
        </div>

        <button type="submit" disabled={saving || nomsSeances.filter(n=>n.trim()).length === 0}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? 'Génération…' : `Générer ${nbSemaines} semaines →`}
        </button>
      </form>
    </div>
  )
}

function SeanceEditor({ seance, getExosPourMuscle, onAddExercice, onUpdateExercice, onDeleteExercice, onAddCustomExo }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-medium text-gray-800">{seance.nom}</h3>
      </div>
      <div className="p-4 space-y-2">
        <div className="grid grid-cols-12 gap-2 px-1 text-xs text-gray-400 font-medium mb-1">
          <div className="col-span-2">Muscle</div>
          <div className="col-span-3">Exercice</div>
          <div className="col-span-1 text-center">Sets</div>
          <div className="col-span-2">Reps</div>
          <div className="col-span-2">Repos</div>
          <div className="col-span-1">Indication</div>
          <div className="col-span-1"></div>
        </div>

        {(seance.exercices || []).sort((a, b) => a.ordre - b.ordre).map(ex => (
          <ExerciceRow key={ex.id} exercice={ex}
            getExosPourMuscle={getExosPourMuscle}
            onUpdate={(field, val) => onUpdateExercice(ex.id, field, val)}
            onDelete={() => onDeleteExercice(ex.id)}
            onAddCustomExo={onAddCustomExo}
          />
        ))}

        <button onClick={onAddExercice} className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium">
          + Ajouter un exercice
        </button>
      </div>
    </div>
  )
}

function ExerciceRow({ exercice, getExosPourMuscle, onUpdate, onDelete, onAddCustomExo }) {
  const [muscle, setMuscle] = useState(exercice.muscle || '')
  const [nom, setNom]       = useState(exercice.nom || '')
  const [sets, setSets]     = useState(exercice.sets || 3)
  const [repRange, setRepRange] = useState(exercice.rep_range || '8-10')
  const [repos, setRepos]   = useState(exercice.repos || "2'")
  const [indication, setIndication] = useState(exercice.indications || '')
  const [addingExo, setAddingExo] = useState(false)
  const [newExoName, setNewExoName] = useState('')

  const exosDispo = muscle ? getExosPourMuscle(muscle) : []

  function handleMuscleChange(val) {
    setMuscle(val)
    setNom('')
    onUpdate('muscle', val)
    onUpdate('nom', '')
  }

  function handleNomChange(val) {
    if (val === '__new__') { setAddingExo(true); return }
    setNom(val)
    onUpdate('nom', val)
  }

  async function handleAddCustom() {
    if (!newExoName.trim() || !muscle) return
    await onAddCustomExo(muscle, newExoName)
    setNom(newExoName)
    onUpdate('nom', newExoName)
    setNewExoName('')
    setAddingExo(false)
  }

  const selectClass = "w-full border border-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50"

  return (
    <div className="grid grid-cols-12 gap-2 items-start">
      {/* Muscle */}
      <div className="col-span-2">
        <select value={muscle} onChange={e => handleMuscleChange(e.target.value)} className={selectClass}>
          <option value="">—</option>
          {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Exercice */}
      <div className="col-span-3">
        {addingExo ? (
          <div className="flex gap-1">
            <input autoFocus value={newExoName} onChange={e => setNewExoName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
              placeholder="Nom de l'exercice"
              className="flex-1 border border-brand-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white" />
            <button onClick={handleAddCustom} className="text-brand-600 text-sm font-medium px-1">✓</button>
            <button onClick={() => setAddingExo(false)} className="text-gray-400 text-sm px-1">✕</button>
          </div>
        ) : (
          <select value={nom} onChange={e => handleNomChange(e.target.value)} className={selectClass} disabled={!muscle}>
            <option value="">— choisir</option>
            {exosDispo.map(e => <option key={e} value={e}>{e}</option>)}
            <option value="__new__">+ Ajouter un exercice…</option>
          </select>
        )}
      </div>

      {/* Sets */}
      <div className="col-span-1">
        <input type="number" value={sets} min={1} max={10}
          onChange={e => setSets(e.target.value)}
          onBlur={() => onUpdate('sets', sets)}
          className={selectClass + " text-center"} />
      </div>

      {/* Rep range */}
      <div className="col-span-2">
        <input value={repRange} onChange={e => setRepRange(e.target.value)} onBlur={() => onUpdate('rep_range', repRange)}
          placeholder="8-10" className={selectClass} />
      </div>

      {/* Repos */}
      <div className="col-span-2">
        <select value={repos} onChange={e => { setRepos(e.target.value); onUpdate('repos', e.target.value) }} className={selectClass}>
          {TEMPS_REPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Indication */}
      <div className="col-span-1">
        <input value={indication} onChange={e => setIndication(e.target.value)}
          onBlur={() => onUpdate('indications', indication)}
          placeholder="Note" className={selectClass} />
      </div>

      {/* Supprimer */}
      <div className="col-span-1 flex justify-center pt-1">
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
      </div>
    </div>
  )
}

function BonusEditor({ seance }) {
  const activites = seance.activites_bonus || []
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-medium text-gray-800">Activités bonus</h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {activites.sort((a, b) => a.ordre - b.ordre).map(act => (
          <span key={act.id} className="bg-brand-50 text-brand-700 text-xs px-3 py-1.5 rounded-full font-medium">{act.nom}</span>
        ))}
      </div>
    </div>
  )
}
