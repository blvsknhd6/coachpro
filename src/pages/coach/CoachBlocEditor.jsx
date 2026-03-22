import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'

const JOURS_DEFAUT = [
  'Jour 1 : Lower Body 1',
  'Jour 2 : Upper Body 1',
  'Jour 3 : Lower Body 2',
  'Jour 4 : Lower Body 3',
]

const BONUS_DEFAUT = [
  'Abdos 1', 'Abdos 2', 'Run Zone 2', 'Run Fractionné', 'Pilates', 'Circuit Cross Training'
]

export default function CoachBlocEditor() {
  const { blocId } = useParams()
  const [bloc, setBloc]           = useState(null)
  const [semaines, setSemaines]   = useState([])
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]     = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { fetchBloc() }, [blocId])
  useEffect(() => { if (activeSemaine) fetchSeances(activeSemaine.id) }, [activeSemaine])

  async function fetchBloc() {
    const { data: b } = await supabase.from('blocs').select('*').eq('id', blocId).single()
    setBloc(b)
    const { data: s } = await supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero')
    setSemaines(s || [])
    if (s && s.length > 0) setActiveSemaine(s[0])
    else setLoading(false)
  }

  async function fetchSeances(semaineId) {
    setLoading(true)
    const { data } = await supabase
      .from('seances')
      .select('*, exercices(*, id), activites_bonus(*)')
      .eq('semaine_id', semaineId)
      .order('ordre')
    setSeances(data || [])
    setLoading(false)
  }

  async function addSemaine() {
    const num = (semaines[semaines.length - 1]?.numero || 0) + 1
    const { data: newSem } = await supabase.from('semaines').insert({ bloc_id: blocId, numero: num }).select().single()
    // Créer les séances par défaut
    for (let i = 0; i < JOURS_DEFAUT.length; i++) {
      await supabase.from('seances').insert({ semaine_id: newSem.id, nom: JOURS_DEFAUT[i], ordre: i })
    }
    // Créer une séance "Bonus"
    const { data: bonusSeance } = await supabase.from('seances').insert({ semaine_id: newSem.id, nom: 'Bonus', ordre: 4 }).select().single()
    for (let i = 0; i < BONUS_DEFAUT.length; i++) {
      await supabase.from('activites_bonus').insert({ seance_id: bonusSeance.id, nom: BONUS_DEFAUT[i], ordre: i })
    }
    setSemaines(s => [...s, newSem])
    setActiveSemaine(newSem)
  }

  async function addExercice(seanceId) {
    const seance = seances.find(s => s.id === seanceId)
    const ordre = (seance?.exercices?.length || 0)
    await supabase.from('exercices').insert({
      seance_id: seanceId, nom: 'Nouvel exercice', sets: 3, rep_range: '8-10', repos: "2'", ordre
    })
    fetchSeances(activeSemaine.id)
  }

  async function updateExercice(id, field, value) {
    await supabase.from('exercices').update({ [field]: value }).eq('id', id)
  }

  async function deleteExercice(id) {
    await supabase.from('exercices').delete().eq('id', id)
    fetchSeances(activeSemaine.id)
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/coach/athlete/${bloc?.athlete_id}`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <h1 className="text-xl font-semibold">{bloc?.name} — Programme</h1>
      </div>

      {/* Sélecteur de semaines */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {semaines.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSemaine(s)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeSemaine?.id === s.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}
          >
            Semaine {s.numero}
          </button>
        ))}
        <button
          onClick={addSemaine}
          className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-600"
        >
          + Semaine
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="space-y-6">
          {seances.filter(s => s.nom !== 'Bonus').map(seance => (
            <SeanceEditor
              key={seance.id}
              seance={seance}
              onAddExercice={() => addExercice(seance.id)}
              onUpdateExercice={updateExercice}
              onDeleteExercice={deleteExercice}
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

function SeanceEditor({ seance, onAddExercice, onUpdateExercice, onDeleteExercice }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-medium text-gray-800">{seance.nom}</h3>
      </div>
      <div className="p-4 space-y-2">
        {/* En-têtes */}
        <div className="grid grid-cols-12 gap-2 px-1 text-xs text-gray-400 font-medium mb-1">
          <div className="col-span-2">Muscle</div>
          <div className="col-span-3">Exercice</div>
          <div className="col-span-1">Sets</div>
          <div className="col-span-2">Reps</div>
          <div className="col-span-2">Repos</div>
          <div className="col-span-1">Charge</div>
          <div className="col-span-1"></div>
        </div>

        {(seance.exercices || []).sort((a, b) => a.ordre - b.ordre).map(ex => (
          <ExerciceRow
            key={ex.id}
            exercice={ex}
            onUpdate={(field, val) => onUpdateExercice(ex.id, field, val)}
            onDelete={() => onDeleteExercice(ex.id)}
          />
        ))}

        <button
          onClick={onAddExercice}
          className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium"
        >
          + Ajouter un exercice
        </button>
      </div>
    </div>
  )
}

function ExerciceRow({ exercice, onUpdate, onDelete }) {
  const [vals, setVals] = useState({
    muscle: exercice.muscle || '',
    nom: exercice.nom || '',
    sets: exercice.sets || 3,
    rep_range: exercice.rep_range || '8-10',
    repos: exercice.repos || "2'",
    indications: exercice.indications || '',
  })

  function handleBlur(field) {
    if (vals[field] !== (exercice[field] || '')) onUpdate(field, vals[field])
  }

  const cell = (field, placeholder, colSpan = 2) => (
    <div className={`col-span-${colSpan}`}>
      <input
        value={vals[field]}
        onChange={e => setVals(v => ({ ...v, [field]: e.target.value }))}
        onBlur={() => handleBlur(field)}
        placeholder={placeholder}
        className="w-full border border-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50"
      />
    </div>
  )

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      {cell('muscle', 'Muscle', 2)}
      {cell('nom', 'Exercice', 3)}
      <div className="col-span-1">
        <input
          type="number"
          value={vals.sets}
          onChange={e => setVals(v => ({ ...v, sets: e.target.value }))}
          onBlur={() => handleBlur('sets')}
          className="w-full border border-gray-100 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 hover:border-gray-300 bg-gray-50 text-center"
        />
      </div>
      {cell('rep_range', '8-10', 2)}
      {cell('repos', "3'", 2)}
      {cell('indications', 'Indication', 1)}
      <div className="col-span-1 flex justify-end">
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
      </div>
    </div>
  )
}

function BonusEditor({ seance }) {
  const [activites, setActivites] = useState(seance.activites_bonus || [])

  async function toggle(act) {
    // Juste affichage ici, pas d'édition du bonus dans le coach editor
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-medium text-gray-800">Activités bonus</h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {activites.sort((a, b) => a.ordre - b.ordre).map(act => (
          <span key={act.id} className="bg-brand-50 text-brand-700 text-xs px-3 py-1.5 rounded-full font-medium">
            {act.nom}
          </span>
        ))}
      </div>
    </div>
  )
}
