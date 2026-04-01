import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import RecapTracking from '../../components/coach/RecapTracking'
import ProgressionPanel from '../../components/shared/ProgressionPanel'

export default function CoachAthlete() {
  const { athleteId } = useParams()
  const [athlete, setAthlete]         = useState(null)
  const [blocs, setBlocs]             = useState([])
  const [activeBloc, setActiveBloc]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showNewBloc, setShowNewBloc] = useState(false)
  const [newBlocName, setNewBlocName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ full_name: '', genre: 'homme' })
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
      setProfileForm({ full_name: ath.full_name || '', genre: ath.genre || 'homme' })
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
      .update({ full_name: profileForm.full_name.trim(), genre: profileForm.genre })
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
      await supabase.from('objectifs_bloc').insert({
        bloc_id: newBloc.id, poids_cible: objData.poids_cible, kcal: objData.kcal,
        proteines: objData.proteines, glucides: objData.glucides, lipides: objData.lipides,
        sommeil: objData.sommeil, pas_journaliers: objData.pas_journaliers,
        stress_cible: objData.stress_cible, seances_par_semaine: objData.seances_par_semaine,
        bornes: objData.bornes,
      })
    }
    const { data: semaines } = await supabase.from('semaines').select('*').eq('bloc_id', bloc.id).order('numero')
    for (const sem of semaines || []) {
      const { data: newSem } = await supabase.from('semaines')
        .insert({ bloc_id: newBloc.id, numero: sem.numero }).select().single()
      const { data: seances } = await supabase.from('seances')
        .select('*, exercices(*), activites_bonus(*)').eq('semaine_id', sem.id).order('ordre')
      for (const sc of seances || []) {
        const { data: newSc } = await supabase.from('seances')
          .insert({ semaine_id: newSem.id, nom: sc.nom, ordre: sc.ordre }).select().single()
        if (sc.exercices?.length) {
          await supabase.from('exercices').insert(sc.exercices.map(ex => ({
            seance_id: newSc.id, muscle: ex.muscle, nom: ex.nom, sets: ex.sets,
            rep_range: ex.rep_range, repos: ex.repos, indications: ex.indications, ordre: ex.ordre
          })))
        }
        if (sc.activites_bonus?.length) {
          await supabase.from('activites_bonus').insert(sc.activites_bonus.map(act => ({
            seance_id: newSc.id, nom: act.nom, ordre: act.ordre
          })))
        }
      }
    }
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
                  <p className="text-xs text-gray-400">{athlete?.genre === 'femme' ? '♀ Femme' : '♂ Homme'}{!athlete?.is_self ? ` · ${athlete?.email}` : ''}</p>
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
                    className={`px-1.5 py-1.5 text-xs transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 hover:bg-brand-800' : 'bg-white text-gray-300 hover:text-brand-500'}`}
                    title="Renommer">✎</button>
                  <button onClick={() => duplicateBloc(b)}
                    className={`px-1.5 py-1.5 text-xs transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 hover:bg-brand-800' : 'bg-white text-gray-300 hover:text-brand-500'}`}
                    title="Dupliquer">⧉</button>
                  <button onClick={() => setConfirmDeleteBloc(b.id)}
                    className={`px-1.5 py-1.5 text-xs transition-colors ${activeBloc?.id === b.id ? 'bg-brand-700 text-brand-200 hover:bg-brand-800' : 'bg-white text-gray-300 hover:text-red-400'}`}
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
          <ObjectifsBloc bloc={activeBloc} onSave={fetchData} />
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
  { key: 'seances_par_semaine', borneKey: 'seances', label: 'Séances / sem.',  unit: '',     type: 'number' },
  { key: 'kcal',                borneKey: 'kcal',    label: 'Kcal / jour',     unit: 'kcal', type: 'number' },
  { key: 'proteines',           borneKey: 'proteines',label: 'Protéines',      unit: 'g',    type: 'number' },
  { key: 'glucides',            borneKey: 'glucides', label: 'Glucides',       unit: 'g',    type: 'number' },
  { key: 'lipides',             borneKey: 'lipides',  label: 'Lipides',        unit: 'g',    type: 'number' },
  { key: 'sommeil',             borneKey: 'sommeil',  label: 'Sommeil',        unit: 'h',    type: 'number', step: '0.5' },
  { key: 'pas_journaliers',     borneKey: 'pas',      label: 'Pas / jour',     unit: '',     type: 'number' },
  { key: 'stress_cible',        borneKey: 'stress',   label: 'Stress cible',   unit: '/10',  type: 'number' },
]

function ObjectifsBloc({ bloc, onSave }) {
  const [obj, setObj]         = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})
  const [bornesForm, setBornesForm] = useState({})
  const [showBornes, setShowBornes] = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { fetchObj() }, [bloc.id])

  async function fetchObj() {
    const { data } = await supabase.from('objectifs_bloc').select('*').eq('bloc_id', bloc.id).single()
    setObj(data)
    if (data) {
      setForm(data)
      setBornesForm(data.bornes || {})
    } else {
      setForm({})
      setBornesForm({})
    }
  }

  async function saveObj() {
    setSaving(true)
    const payload = { ...form, bloc_id: bloc.id, bornes: bornesForm }
    if (obj) await supabase.from('objectifs_bloc').update(payload).eq('id', obj.id)
    else      await supabase.from('objectifs_bloc').insert(payload)
    await fetchObj()
    if (onSave) onSave()
    setEditing(false)
    setSaving(false)
  }

  function setBorne(borneKey, side, value) {
    setBornesForm(b => ({
      ...b,
      [borneKey]: { ...(b[borneKey] || {}), [side]: value === '' ? undefined : Number(value) }
    }))
  }

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
            <button type="button"
              onClick={() => setShowBornes(v => !v)}
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
                      <th className="px-3 py-2 font-medium text-gray-500 text-center">Min (orange si en-dessous)</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-center">Max (orange si au-dessus)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(({ label, borneKey, unit }) => (
                      <tr key={borneKey} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-700">{label}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <input type="number"
                              value={bornesForm[borneKey]?.min ?? ''}
                              onChange={e => setBorne(borneKey, 'min', e.target.value)}
                              placeholder="—"
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 text-center"
                            />
                            {unit && <span className="text-gray-400">{unit}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <input type="number"
                              value={bornesForm[borneKey]?.max ?? ''}
                              onChange={e => setBorne(borneKey, 'max', e.target.value)}
                              placeholder="—"
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 text-center"
                            />
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
        <p className="text-sm text-gray-400">Aucun objectif défini.</p>
      )}
    </div>
  )
}
