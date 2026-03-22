import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/shared/Layout'
import RecapTracking from '../../components/coach/RecapTracking'

export default function CoachAthlete() {
  const { athleteId } = useParams()
  const [athlete, setAthlete] = useState(null)
  const [blocs, setBlocs]     = useState([])
  const [activeBloc, setActiveBloc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNewBloc, setShowNewBloc] = useState(false)
  const [newBlocName, setNewBlocName] = useState('')

  useEffect(() => { fetchData() }, [athleteId])

  async function fetchData() {
    const { data: ath } = await supabase.from('profiles').select('*').eq('id', athleteId).single()
    setAthlete(ath)
    const { data: bl } = await supabase
      .from('blocs')
      .select('*, objectifs_bloc(*)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
    setBlocs(bl || [])
    if (bl && bl.length > 0) setActiveBloc(bl[0])
    setLoading(false)
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

  if (loading) return <Layout><p className="text-gray-400 text-sm">Chargement…</p></Layout>

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/coach" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-medium">
            {athlete?.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{athlete?.full_name}</h1>
            <p className="text-xs text-gray-400">{athlete?.email}</p>
          </div>
        </div>
      </div>

      {/* Sélecteur de blocs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {blocs.map(b => (
          <button
            key={b.id}
            onClick={() => setActiveBloc(b)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeBloc?.id === b.id
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}
          >
            {b.name}
          </button>
        ))}
        {showNewBloc ? (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={newBlocName}
              onChange={e => setNewBlocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createBloc()}
              placeholder="Nom du bloc…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button onClick={createBloc} className="bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm">OK</button>
            <button onClick={() => setShowNewBloc(false)} className="text-gray-400 text-sm">Annuler</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewBloc(true)}
            className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            + Nouveau bloc
          </button>
        )}
      </div>

      {activeBloc ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">{activeBloc.name}</h2>
            <Link
              to={`/coach/bloc/${activeBloc.id}/edit`}
              className="text-sm text-brand-600 hover:text-brand-800 font-medium"
            >
              Éditer le programme →
            </Link>
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
  const [obj, setObj] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchObj()
  }, [bloc.id])

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
        <input
          type="number"
          value={form[key] || ''}
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
