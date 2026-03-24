import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import RecapTracking from '../../components/coach/RecapTracking'

export default function CoachAthlete() {
  const { athleteId } = useParams()
  const [athlete, setAthlete]   = useState(null)
  const [blocs, setBlocs]       = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showNewBloc, setShowNewBloc] = useState(false)
  const [newBlocName, setNewBlocName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ full_name: '', genre: 'homme' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [confirmDeleteBloc, setConfirmDeleteBloc] = useState(null)

  useEffect(() => { fetchData() }, [athleteId])

  async function fetchData() {
    const { data: ath } = await supabase.from('profiles').select('*').eq('id', athleteId).single()
    setAthlete(ath)
    setProfileForm({ full_name: ath?.full_name || '', genre: ath?.genre || 'homme' })
    const { data: bl } = await supabase
      .from('blocs')
      .select('*, objectifs_bloc(*)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
    setBlocs(bl || [])
    if (bl && bl.length > 0) setActiveBloc(bl[0])
    setLoading(false)
  }

  async function saveProfile() {
    setSavingProfile(true)
    await supabase.from('profiles').update({
      full_name: profileForm.full_name,
      genre: profileForm.genre,
    }).eq('id', athleteId)
    setAthlete(a => ({ ...a, ...profileForm }))
    setEditingProfile(false)
    setSavingProfile(false)
  }

  async function createBloc() {
    if (!newBlocName.trim()) return
    const { data } = await supabase.from('blocs').insert({
      athlete_id: athleteId,
      name: newBlocName.trim(),
    }).select().single()
    setBlocs(b => [data, ...b])
    setActiveBloc(data)
    setNewBlocName('')
    setShowNewBloc(false)
  }

  async function deleteBloc(blocId) {
    await supabase.from('blocs').delete().eq('id', blocId)
    const remaining = blocs.filter(b => b.id !== blocId)
    setBlocs(remaining)
    setActiveBloc(remaining[0] || null)
    setConfirmDeleteBloc(null)
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  if (loading) return <Layout><p className="text-gray-400 text-sm">Chargement…</p></Layout>

  return (
    <Layout>
      {/* Confirmation suppression bloc */}
      {confirmDeleteBloc && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold mb-2">Supprimer ce bloc ?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Toutes les séances, exercices et données de suivi associés seront supprimés définitivement.
            </p>
            <div className="flex gap-2">
              <button onClick={() => deleteBloc(confirmDeleteBloc)}
                className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600">
                Supprimer
              </button>
              <button onClick={() => setConfirmDeleteBloc(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/coach" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <div className="flex items-center gap-3 flex-1">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
            athlete?.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'
          }`}>
            {initiales(athlete?.full_name)}
          </div>
          <div className="flex-1">
            {editingProfile ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={profileForm.full_name}
                  onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <div className="flex gap-1">
                  {['homme', 'femme'].map(g => (
                    <button key={g} type="button"
                      onClick={() => setProfileForm(f => ({ ...f, genre: g }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        profileForm.genre === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'
                      }`}>
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
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <h1 className="text-xl font-semibold">{athlete?.full_name}</h1>
                  <p className="text-xs text-gray-400">{athlete?.genre === 'femme' ? '♀ Femme' : '♂ Homme'} · {athlete?.email}</p>
                </div>
                <button onClick={() => setEditingProfile(true)}
                  className="text-xs text-gray-400 hover:text-brand-600 ml-2 transition-colors">
                  Modifier
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sélecteur de blocs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {blocs.map(b => (
          <div key={b.id} className="flex items-center gap-1">
            <button
              onClick={() => setActiveBloc(b)}
              className={`px-3 py-1.5 rounded-l-lg text-sm transition-colors ${
                activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
              }`}>
              {b.name}
            </button>
            <button
              onClick={() => setConfirmDeleteBloc(b.id)}
              className={`px-2 py-1.5 rounded-r-lg text-sm transition-colors border-t border-b border-r ${
                activeBloc?.id === b.id
                  ? 'bg-brand-700 text-brand-200 border-brand-700 hover:bg-brand-800'
                  : 'bg-white border-gray-200 text-gray-300 hover:text-red-400 hover:border-red-200'
              }`}
              title="Supprimer ce bloc">
              ×
            </button>
          </div>
        ))}

        {showNewBloc ? (
          <div className="flex gap-2 items-center">
            <input autoFocus value={newBlocName}
              onChange={e => setNewBlocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createBloc()}
              placeholder="Nom du bloc…"
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
              <Link to={`/coach/athlete/${athleteId}/view`}
                className="text-sm text-gray-500 hover:text-gray-800 font-medium">
                👁 Vue coaché
              </Link>
              <Link to={`/coach/bloc/${activeBloc.id}/edit`}
                className="text-sm text-brand-600 hover:text-brand-800 font-medium">
                Éditer le programme →
              </Link>
            </div>
          </div>
          <ObjectifsBloc bloc={activeBloc} onSave={fetchData} />
          <RecapTracking athleteId={athleteId} blocId={activeBloc.id} />
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400 text-sm">
          Crée un premier bloc pour commencer.
        </div>
      )}
    </Layout>
  )
}

function ObjectifsBloc({ bloc, onSave }) {
  const [obj, setObj]       = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchObj() }, [bloc.id])

  async function fetchObj() {
    const { data } = await supabase.from('objectifs_bloc').select('*').eq('bloc_id', bloc.id).single()
    setObj(data)
    if (data) setForm(data)
  }

  async function saveObj() {
    setSaving(true)
    if (obj) {
      await supabase.from('objectifs_bloc').update(form).eq('id', obj.id)
    } else {
      await supabase.from('objectifs_bloc').insert({ ...form, bloc_id: bloc.id })
    }
    await fetchObj()
    setEditing(false)
    setSaving(false)
  }

  const field = (key, label, unit = '') => (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <div className="flex items-center gap-1 mt-0.5">
        <input type="number" value={form[key] || ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  )

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">Objectifs du bloc</h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={saveObj} disabled={saving} className="text-sm text-brand-600 font-medium hover:text-brand-800">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => setEditing(false)} className="text-sm text-gray-400">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm text-brand-600 hover:text-brand-800">Modifier</button>
        )}
      </div>
      {editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {field('poids_cible', 'Poids cible', 'kg')}
          {field('kcal', 'Kcal / jour', 'kcal')}
          {field('proteines', 'Protéines', 'g')}
          {field('glucides', 'Glucides', 'g')}
          {field('lipides', 'Lipides', 'g')}
          {field('sommeil', 'Sommeil', 'h')}
          {field('pas_journaliers', 'Pas / jour', '')}
          {field('stress_cible', 'Stress cible', '/10')}
        </div>
      ) : obj ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ['Poids cible', obj.poids_cible, 'kg'],
            ['Kcal', obj.kcal, 'kcal'],
            ['Protéines', obj.proteines, 'g'],
            ['Glucides', obj.glucides, 'g'],
            ['Lipides', obj.lipides, 'g'],
            ['Sommeil', obj.sommeil, 'h'],
            ['Pas / jour', obj.pas_journaliers, ''],
            ['Stress cible', obj.stress_cible, '/10'],
          ].map(([label, val, unit]) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-900">{val ?? '—'}{val && unit ? ' ' + unit : ''}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucun objectif défini.</p>
      )}
    </div>
  )
}
