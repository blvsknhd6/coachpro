import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function CoachDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState({ full_name: '', email: '', password: '', genre: 'homme' })
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  useEffect(() => { fetchAthletes() }, [profile])

  async function fetchAthletes() {
    if (!profile) return
    const { data } = await supabase
      .from('profiles').select('*, blocs(id)')
      .eq('coach_id', profile.id).order('full_name')
    setAthletes(data || [])
    setLoading(false)
  }

  async function handleAddAthlete(e) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: form.email, password: form.password })
      if (authError) throw authError
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id, role: 'athlete', full_name: form.full_name,
        email: form.email, genre: form.genre, coach_id: profile.id,
      })
      if (profileError) throw profileError
      setForm({ full_name: '', email: '', password: '', genre: 'homme' })
      setShowAdd(false)
      fetchAthletes()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  async function goToMyTraining() {
    // Vérifier si le coach a un profil athlète associé
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('id', profile.id).single()
    // Le coach utilise son propre profil comme athlète
    // On redirige vers une version athlète en passant l'ID du coach comme athlete_id
    navigate(`/coach/my-training`)
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <Layout>
      {/* Bannière "Mon entraînement" */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-500 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-white font-medium text-sm">Mon entraînement</p>
          <p className="text-brand-100 text-xs mt-0.5">Accède à ton propre programme</p>
        </div>
        <Link to="/coach/my-training"
          className="bg-white text-brand-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-50 transition-colors">
          Voir →
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Mes coachés</h1>
        <button onClick={() => setShowAdd(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
          + Ajouter
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-base font-semibold mb-4">Nouveau coaché</h2>
            <form onSubmit={handleAddAthlete} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Nom complet</label>
                <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Genre</label>
                <div className="mt-1 flex gap-2">
                  {['homme', 'femme'].map(g => (
                    <button key={g} type="button" onClick={() => setForm(f => ({ ...f, genre: g }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.genre === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {g === 'homme' ? '♂ Homme' : '♀ Femme'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input type="email" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mot de passe temporaire</label>
                <input type="text" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                  {saving ? 'Création…' : 'Créer le compte'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-400 text-sm">Chargement…</p> : athletes.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Aucun coaché pour l'instant.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map(a => (
            <Link key={a.id} to={`/coach/athlete/${a.id}`}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${a.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                  {initiales(a.full_name)}
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700">{a.full_name}</p>
                  <p className="text-xs text-gray-400">{a.genre === 'femme' ? '♀' : '♂'} · {a.email}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">{(a.blocs || []).length} bloc{(a.blocs || []).length !== 1 ? 's' : ''}</p>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
