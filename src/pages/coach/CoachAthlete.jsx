import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import RecapTracking from '../../components/coach/RecapTracking'
import ProgressionPanel from '../../components/shared/ProgressionPanel'
import { calcTDEE, nutritionSuggestions } from '../../lib/tdee'

export default function CoachAthlete() {
  const { athleteId } = useParams()
  const [athlete, setAthlete]         = useState(null)
  const [blocs, setBlocs]             = useState([])
  const [activeBloc, setActiveBloc]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showNewBloc, setShowNewBloc] = useState(false)
  const [newBlocName, setNewBlocName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ full_name: '', genre: 'homme', taille: '', age: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileErr, setProfileErr]   = useState('')
  const [confirmDeleteBloc, setConfirmDeleteBloc] = useState(null)
  const [editingBlocName, setEditingBlocName] = useState(null)
  const [editBlocNameVal, setEditBlocNameVal] = useState('')

  useEffect(() => { fetchData() }, [athleteId])

  async function fetchData() {
    setLoading(true)
    const { data: ath } = await supabase.from('profiles').select('*').eq('id', athleteId).single()
    if (ath) {
      setAthlete(ath)
      setProfileForm({
        full_name: ath.full_name || '',
        genre:     ath.genre    || 'homme',
        taille:    ath.taille   || '',
        age:       ath.age      || '',
      })
    }
    const { data: bl } = await supabase
      .from('blocs').select('*, objectifs_bloc(*)')
      .eq('athlete_id', athleteId).order('created_at', { ascending: false })
    setBlocs(bl || [])
    if (bl?.length) setActiveBloc(bl[0])
    setLoading(false)
  }

  async function saveProfile() {
    if (!profileForm.full_name.trim()) return
    setSavingProfile(true); setProfileErr('')
    const { data, error } = await supabase.from('profiles')
      .update({
        full_name: profileForm.full_name.trim(),
        genre:     profileForm.genre,
        taille:    profileForm.taille ? Number(profileForm.taille) : null,
        age:       profileForm.age    ? Number(profileForm.age)    : null,
      })
      .eq('id', athleteId).select().single()
    if (!error && data) { setAthlete(data); setEditingProfile(false) }
    else setProfileErr(error?.message || 'Erreur lors de la sauvegarde')
    setSavingProfile(false)
  }

  async function createBloc() {
    if (!newBlocName.trim()) return
    const { data } = await supabase.from('blocs')
      .insert({ athlete_id: athleteId, name: newBlocName.trim() }).select().single()
    setBlocs(b => [data, ...b]); setActiveBloc(data); setNewBlocName(''); setShowNewBloc(false)
  }

  async function renameBloc(blocId, newName) {
    if (!newName.trim()) return
    await supabase.from('blocs').update({ name: newName.trim() }).eq('id', blocId)
    setBlocs(bs => bs.map(b => b.id === blocId ? { ...b, name: newName.trim() } : b))
    if (activeBloc?.id === blocId) setActiveBloc(b => ({ ...b, name: newName.trim() }))
    setEditingBlocName(null)
  }

  async function duplicateBloc(bloc) {
    const { data: newBloc } = await supabase.from('blocs')
      .insert({ athlete_id: athleteId, name: bloc.name + ' (copie)' }).select().single()

    const objData = Array.isArray(bloc.objectifs_bloc) ? bloc.objectifs_bloc[0] : bloc.objectifs_bloc
    if (objData) {
      const { id: _id, bloc_id: _b, ...objRest } = objData
      await supabase.from('objectifs_bloc').insert({ ...objRest, bloc_id: newBloc.id })
    }

    const { data: semaines } = await supabase
      .from('semaines').select('*').eq('bloc_id', bloc.id).order('numero')
    if (!semaines?.length) {
      setBlocs(bs => [newBloc, ...bs]); setActiveBloc(newBloc); return
    }

    const { data: newSemaines } = await supabase.from('semaines')
      .insert(semaines.map(s => ({ bloc_id: newBloc.id, numero: s.numero }))).select()

    const oldToNewSem = {}
    semaines.forEach((s, i) => { oldToNewSem[s.id] = newSemaines[i].id })

    const { data: seancesSource } = await supabase
      .from('seances').select('*, exercices(*), activites_bonus(*)')
      .in('semaine_id', semaines.map(s => s.id)).order('ordre')

    if (!seancesSource?.length) {
      setBlocs(bs => [newBloc, ...bs]); setActiveBloc(newBloc); return
    }

    const { data: newSeances } = await supabase.from('seances')
      .insert(seancesSource.map(sc => ({
        semaine_id: oldToNewSem[sc.semaine_id], nom: sc.nom, ordre: sc.ordre,
      }))).select()

    const oldToNewSc = {}
    seancesSource.forEach((sc, i) => { oldToNewSc[sc.id] = newSeances[i].id })

    const allExercices = seancesSource.flatMap(sc =>
      (sc.exercices || []).map(ex => ({
        seance_id: oldToNewSc[sc.id], muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
        rep_range: ex.rep_range, repos: ex.repos, indications: ex.indications, ordre: ex.ordre,
        charge_indicative: ex.charge_indicative, rpe_cible: ex.rpe_cible,
        unilateral: ex.unilateral, main_lift: ex.main_lift,
      }))
    )
    const allBonus = seancesSource.flatMap(sc =>
      (sc.activites_bonus || []).map(act => ({
        seance_id: oldToNewSc[sc.id], nom: act.nom, ordre: act.ordre,
      }))
    )

    await Promise.all([
      allExercices.length ? supabase.from('exercices').insert(allExercices) : null,
      allBonus.length ? supabase.from('activites_bonus').insert(allBonus) : null,
    ].filter(Boolean))

    setBlocs(bs => [newBloc, ...bs]); setActiveBloc(newBloc)
  }

  async function deleteBloc(blocId) {
    await supabase.from('blocs').delete().eq('id', blocId)
    const remaining = blocs.filter(b => b.id !== blocId)
    setBlocs(remaining); setActiveBloc(remaining[0] || null); setConfirmDeleteBloc(null)
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  if (loading) return <Layout><p className="text-gray-400 text-sm">Chargement…</p></Layout>

  return (
    <Layout>
      {confirmDeleteBloc && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold mb-2">Supprimer ce bloc ?</h3>
            <p className="text-sm text-gray-500 mb-5">Toutes les données associées seront supprimées définitivement.</p>
            <div className="flex gap-2">
              <button onClick={() => deleteBloc(confirmDeleteBloc)} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600">Supprimer</button>
              <button onClick={() => setConfirmDeleteBloc(null)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link to="/coach" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <div className="flex items-center gap-3 flex-1">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${athlete?.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
            {initiales(athlete?.full_name)}
          </div>
          <div className="flex-1">
            {editingProfile ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <input value={profileForm.full_name}
                    onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="Nom complet"
                  />
                  <div className="flex gap-1">
                    {['homme', 'femme'].map(g => (
                      <button key={g} type="button"
                        onClick={() => setProfileForm(f => ({ ...f, genre: g }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${profileForm.genre === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                        {g === 'homme' ? '♂' : '♀'} {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <input type="number" value={profileForm.taille}
                      onChange={e => setProfileForm(f => ({ ...f, taille: e.target.value }))}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      placeholder="Taille"
                    />
                    <span className="text-xs text-gray-400">cm</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number" value={profileForm.age}
                      onChange={e => setProfileForm(f => ({ ...f, age: e.target.value }))}
                      className="w-16 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      placeholder="Âge"
                    />
                    <span className="text-xs text-gray-400">ans</span>
                  </div>
                  <button onClick={saveProfile} disabled={savingProfile}
                    className="text-sm text-brand-600 font-medium hover:text-brand-800">
                    {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                  <button onClick={() => setEditingProfile(false)} className="text-sm text-gray-400">Annuler</button>
                </div>
                {profileErr && <p className="text-xs text-red-500">{profileErr}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold">{athlete?.full_name}</h1>
                    {athlete?.is_self && <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Moi</span>}
                  </div>
                  <p className="text-xs text-gray-400">
                    {athlete?.genre === 'femme' ? '♀ Femme' : '♂ Homme'}
                    {athlete?.taille ? ` · ${athlete.taille}cm` : ''}
                    {athlete?.age    ? ` · ${athlete.age}ans`   : ''}
                    {!athlete?.is_self ? ` · ${athlete?.email}` : ''}
                  </p>
                </div>
                <button onClick={() => setEditingProfile(true)} className="text-xs text-gray-400 hover:text-brand-600 ml-2">Modifier</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sélecteur blocs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {blocs.map(b => (
          <div key={b.id} className="flex items-center group">
            {editingBlocName === b.id ? (
              <input autoFocus value={editBlocNameVal}
                onChange={e => setEditBlocNameVal(e.target.value)}
                onBlur={() => renameBloc(b.id, editBlocNameVal)}
                onKeyDown={e => e.key === 'Enter' && renameBloc(b.id, editBlocNameVal)}
                className="border border-brand-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 w-36"
              />
            ) : (
              <>
                <button onClick={() => setActiveBloc(b)}
                  className={`px-3 py-1.5 rounded-l-lg text-sm transition-colors ${activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                  {b.name}
                </button>
                <div className={`flex border-t border-b border-r rounded-r-lg overflow-hidden ${activeBloc?.id === b.id ? 'border-brand-600' : 'border-gray-200'}`}>
                  <button onClick={() => { setEditingBlocName(b.id); setEditBlocNameVal(b.name) }}
                    className={`px-1.5 py-1.5 text-xs transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800' : 'bg-white text-gray-300 hover:text-brand-500'}`}
                    title="Renommer">✎</button>
                  <button onClick={() => duplicateBloc(b)}
                    className={`px-1.5 py-1.5 text-xs transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800' : 'bg-white text-gray-300 hover:text-brand-500'}`}
                    title="Dupliquer">⧉</button>
                  <button onClick={() => setConfirmDeleteBloc(b.id)}
                    className={`px-1.5 py-1.5 text-xs transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800' : 'bg-white text-gray-300 hover:text-red-400'}`}
                    title="Supprimer">×</button>
                </div>
              </>
            )}
          </div>
        ))}
        {showNewBloc ? (
          <div className="flex gap-2 items-center">
            <input autoFocus value={newBlocName} onChange={e => setNewBlocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createBloc()} placeholder="Nom du bloc…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button onClick={createBloc} className="bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm">OK</button>
            <button onClick={() => setShowNewBloc(false)} className="text-gray-400 text-sm">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setShowNewBloc(true)}
            className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors">
            + Nouveau bloc
          </button>
        )}
      </div>

      {activeBloc ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">{activeBloc.name}</h2>
            <div className="flex items-center gap-4">
              <Link to={`/coach/athlete/${athleteId}/view`} className="text-sm text-gray-500 hover:text-gray-800 font-medium">
                👁 Vue athlète
              </Link>
              <Link to={`/coach/bloc/${activeBloc.id}/edit`} className="text-sm text-brand-600 hover:text-brand-800 font-medium">
                Éditer le programme →
              </Link>
            </div>
          </div>
          <ObjectifsBloc
            bloc={activeBloc}
            athlete={athlete}
            onSave={fetchData}
          />
          {!athlete?.is_self && <RecapTracking athleteId={athleteId} blocId={activeBloc.id} coachMode />}
          <ProgressionPanel
            athleteId={athleteId}
            config={{ metric: 'tonnage', display: 'graph', fav_exercices: [], muscles_filter: [] }}
            onConfigChange={() => {}}
            color={athlete?.genre === 'femme' ? '#ec4899' : '#6366f1'}
          />
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400 text-sm">Crée un premier bloc pour commencer.</div>
      )}
    </Layout>
  )
}

// ── Métriques éditables ────────────────────────────────────────────────────
const METRICS = [
  { key: 'seances_par_semaine', borneKey: 'seances',   label: 'Séances / sem.',  unit: '',     type: 'number' },
  { key: 'kcal',                borneKey: 'kcal',      label: 'Kcal / jour',     unit: 'kcal', type: 'number' },
  { key: 'proteines',           borneKey: 'proteines', label: 'Protéines',       unit: 'g',    type: 'number' },
  { key: 'glucides',            borneKey: 'glucides',  label: 'Glucides',        unit: 'g',    type: 'number' },
  { key: 'lipides',             borneKey: 'lipides',   label: 'Lipides',         unit: 'g',    type: 'number' },
  { key: 'sommeil',             borneKey: 'sommeil',   label: 'Sommeil',         unit: 'h',    type: 'number', step: '0.5' },
  { key: 'pas_journaliers',     borneKey: 'pas',       label: 'Pas / jour',      unit: '',     type: 'number' },
  { key: 'stress_cible',        borneKey: 'stress',    label: 'Stress cible',    unit: '/10',  type: 'number' },
]

function ObjectifsBloc({ bloc, athlete, onSave }) {
  const [obj, setObj]               = useState(null)
  const [editing, setEditing]       = useState(false)
  const [form, setForm]             = useState({})
  const [bornesForm, setBornesForm] = useState({})
  const [showBornes, setShowBornes] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [tdeeData, setTdeeData]     = useState(null)
  const [loadingTdee, setLoadingTdee] = useState(false)

  useEffect(() => { fetchObj() }, [bloc.id])
  useEffect(() => { if (athlete) fetchTdee() }, [athlete?.id, bloc.id])

  async function fetchObj() {
    const { data } = await supabase.from('objectifs_bloc').select('*').eq('bloc_id', bloc.id).single()
    setObj(data)
    if (data) { setForm(data); setBornesForm(data.bornes || {}) }
    else { setForm({}); setBornesForm({}) }
  }

  async function fetchTdee() {
    if (!athlete?.taille || !athlete?.age) return
    setLoadingTdee(true)

    // Dernier poids non-null dans data_tracking
    const { data: poidsData } = await supabase
      .from('data_tracking')
      .select('poids, date')
      .eq('athlete_id', athlete.id)
      .not('poids', 'is', null)
      .order('date', { ascending: false })
      .limit(1)

    const poids = poidsData?.[0]?.poids
    if (!poids) { setLoadingTdee(false); return }

    // Moyennes d'activité sur les 30 derniers jours
    const thirtyAgo = new Date()
    thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const { data: tracking } = await supabase
      .from('data_tracking')
      .select('pas_journaliers, sport_fait, date')
      .eq('athlete_id', athlete.id)
      .gte('date', thirtyAgo.toISOString().split('T')[0])
      .order('date')

    const entries = tracking || []
    const pasVals = entries.map(e => e.pas_journaliers).filter(v => v != null)
    const pasJournaliersMoy = pasVals.length
      ? pasVals.reduce((a, b) => a + b, 0) / pasVals.length
      : 0
    const sportJours = entries.filter(e => e.sport_fait).length
    const nbSemaines = Math.max(1, entries.length / 7)
    const seancesParSemaine = sportJours / nbSemaines

    const result = calcTDEE(
      { poids, taille: athlete.taille, age: athlete.age, genre: athlete.genre },
      { pasJournaliersMoy, seancesParSemaine }
    )
    if (result) {
      setTdeeData({
        ...result,
        poids,
        pasJournaliersMoy: Math.round(pasJournaliersMoy),
        seancesParSemaine: parseFloat(seancesParSemaine.toFixed(1)),
        lastPoidsDate: poidsData[0].date,
      })
    }
    setLoadingTdee(false)
  }

  async function saveObj() {
    setSaving(true)
    const payload = { ...form, bloc_id: bloc.id, bornes: bornesForm }

    // Mise à jour de objectifs_bloc (lecture courante)
    if (obj) await supabase.from('objectifs_bloc').update(payload).eq('id', obj.id)
    else      await supabase.from('objectifs_bloc').insert(payload)

    // Insertion dans l'historique avec la date d'aujourd'hui
    await supabase.from('objectifs_bloc_historique').insert({
      bloc_id:             bloc.id,
      date_debut:          new Date().toISOString().split('T')[0],
      kcal:                form.kcal                || null,
      proteines:           form.proteines           || null,
      glucides:            form.glucides            || null,
      lipides:             form.lipides             || null,
      sommeil:             form.sommeil             || null,
      pas_journaliers:     form.pas_journaliers     || null,
      stress_cible:        form.stress_cible        || null,
      seances_par_semaine: form.seances_par_semaine || null,
      plan_nutritionnel:   form.plan_nutritionnel   || null,
      bornes:              bornesForm,
    })

    await fetchObj()
    if (onSave) onSave()
    setEditing(false)
    setSaving(false)
  }

  function applySuggestion(plan) {
    if (!tdeeData) return
    const sugg = nutritionSuggestions(tdeeData.tdee, tdeeData.poids, plan)
    setForm(f => ({
      ...f,
      plan_nutritionnel: plan,
      kcal:              sugg.kcal,
      proteines:         sugg.proteines,
      glucides:          sugg.glucides,
      lipides:           sugg.lipides,
    }))
  }

  function setBorne(borneKey, side, value) {
    setBornesForm(b => ({
      ...b,
      [borneKey]: { ...(b[borneKey] || {}), [side]: value === '' ? undefined : Number(value) }
    }))
  }

  const missingMorpho = !athlete?.taille || !athlete?.age

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">Objectifs du bloc</h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={saveObj} disabled={saving} className="text-sm text-brand-600 font-medium hover:text-brand-800">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => { setEditing(false); setForm(obj || {}); setBornesForm(obj?.bornes || {}) }}
              className="text-sm text-gray-400">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm text-brand-600 hover:text-brand-800">Modifier</button>
        )}
      </div>

      {/* ── Encart TDEE ── */}
      {missingMorpho ? (
        <div className="mb-4 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-xs text-gray-500">
          💡 Ajoute la <strong>taille</strong> et l'<strong>âge</strong> de l'athlète pour calculer son maintien calorique.
        </div>
      ) : loadingTdee ? (
        <div className="mb-4 h-16 bg-gray-50 rounded-lg animate-pulse" />
      ) : tdeeData ? (
        <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-semibold text-blue-700 mb-0.5">Maintien estimé</p>
              <p className="text-2xl font-bold text-blue-800">{tdeeData.tdee} <span className="text-sm font-normal">kcal/j</span></p>
              <p className="text-xs text-blue-500 mt-0.5">
                BMR {tdeeData.bmr} kcal · ×{tdeeData.multiplier} ({tdeeData.activityLabel})
              </p>
              <p className="text-xs text-blue-400 mt-0.5">
                Basé sur {tdeeData.poids}kg · {tdeeData.pasJournaliersMoy.toLocaleString('fr')} pas/j · {tdeeData.seancesParSemaine} séances/sem (30j)
              </p>
            </div>
            {editing && (
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <p className="text-xs text-blue-600 font-medium mb-0.5">Pré-remplir :</p>
                {[
                  ['seche',        '🔥 Sèche',          'bg-orange-100 text-orange-700 hover:bg-orange-200'],
                  ['maintien',     '⚖️ Maintien',        'bg-blue-100 text-blue-700 hover:bg-blue-200'],
                  ['prise_de_masse','💪 Prise de masse', 'bg-green-100 text-green-700 hover:bg-green-200'],
                ].map(([plan, label, cls]) => (
                  <button key={plan} onClick={() => applySuggestion(plan)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${cls}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {editing && (
            <p className="text-xs text-blue-400 mt-2">
              Sèche : {tdeeData.tdee - 200} kcal · Maintien : {tdeeData.tdee} kcal · Prise : {tdeeData.tdee + 250} kcal
            </p>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="space-y-5">
          {/* Plan nutritionnel */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Plan nutritionnel</label>
            <div className="flex gap-2">
              {[['prise_de_masse','💪 Prise de masse'],['maintien','⚖️ Maintien'],['seche','🔥 Sèche']].map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => setForm(f => ({ ...f, plan_nutritionnel: val }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${form.plan_nutritionnel === val ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cibles */}
          <div>
            <label className="text-xs text-gray-500 block mb-2">Cibles</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {METRICS.map(({ key, label, unit, type, step }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <div className="flex items-center gap-1 mt-0.5">
                    <input type={type} step={step} value={form[key] || ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    {unit && <span className="text-xs text-gray-400">{unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bornes personnalisées */}
          <div>
            <button type="button" onClick={() => setShowBornes(v => !v)}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1">
              {showBornes ? '▾' : '▸'} Bornes de couleur personnalisées
            </button>
            <p className="text-xs text-gray-400 mt-0.5">
              Définit les plages vertes/oranges/rouges sur les graphiques et l'historique.
            </p>
            {showBornes && (
              <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Métrique</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-center">Min</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-center">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(({ label, borneKey, unit }) => (
                      <tr key={borneKey} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-700">{label}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <input type="number" value={bornesForm[borneKey]?.min ?? ''}
                              onChange={e => setBorne(borneKey, 'min', e.target.value)} placeholder="—"
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 text-center" />
                            {unit && <span className="text-gray-400">{unit}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <input type="number" value={bornesForm[borneKey]?.max ?? ''}
                              onChange={e => setBorne(borneKey, 'max', e.target.value)} placeholder="—"
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 text-center" />
                            {unit && <span className="text-gray-400">{unit}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400">
                  ✓ Vert = dans la plage · ○ Orange = légèrement hors plage (±15%) · ✗ Rouge = hors plage
                </div>
              </div>
            )}
          </div>
        </div>
      ) : obj ? (
        <div className="space-y-3">
          {obj.plan_nutritionnel && (
            <div className="text-sm font-medium text-gray-800">
              {{'prise_de_masse':'💪 Prise de masse','maintien':'⚖️ Maintien','seche':'🔥 Sèche'}[obj.plan_nutritionnel]}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {METRICS.map(({ key, label, unit }) => (
              <div key={key}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm font-medium text-gray-900">
                  {obj[key] != null ? `${obj[key]}${unit ? ' ' + unit : ''}` : '—'}
                </p>
              </div>
            ))}
          </div>
          {obj.bornes && Object.keys(obj.bornes).length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Bornes personnalisées : {Object.keys(obj.bornes).join(', ')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucun objectif défini. <button onClick={() => setEditing(true)} className="text-brand-600 hover:underline">Ajouter →</button></p>
      )}
    </div>
  )
}
