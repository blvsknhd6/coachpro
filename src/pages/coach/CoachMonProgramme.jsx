import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function CoachMonProgramme() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [selfProfile, setSelfProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (profile) findOrShowCreate() }, [profile])

  async function findOrShowCreate() {
    // Cherche un profil is_self lié à ce coach
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('coach_id', profile.id)
      .eq('is_self', true)
      .single()

    if (data) {
      setSelfProfile(data)
      // Redirige directement vers la fiche athlète pour gérer son propre programme
      navigate(`/coach/athlete/${data.id}`, { replace: true })
    } else {
      setLoading(false)
    }
  }

  async function createSelfProfile() {
    setCreating(true)
    // Crée un profil athlète spécial sans compte auth séparé
    // On utilise un UUID aléatoire et on l'insère directement
    const selfId = crypto.randomUUID()
    const { data, error } = await supabase.from('profiles').insert({
      id: selfId,
      role: 'athlete',
      full_name: profile.full_name,
      email: profile.email,
      genre: profile.genre || 'homme',
      coach_id: profile.id,
      is_self: true,
    }).select().single()

    if (!error && data) {
      navigate(`/coach/athlete/${data.id}`, { replace: true })
    } else {
      console.error(error)
      setCreating(false)
    }
  }

  if (loading) return (
    <Layout>
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">Chargement…</p>
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🏋️</span>
        </div>
        <h1 className="text-xl font-semibold mb-2">Mon entraînement</h1>
        <p className="text-sm text-gray-500 mb-6">
          Crée ton profil athlète personnel pour gérer ton propre programme depuis ton compte coach.
          Tu apparaîtras en premier dans la liste de tes coachés avec le badge "Moi".
        </p>
        <button onClick={createSelfProfile} disabled={creating}
          className="bg-brand-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {creating ? 'Création…' : 'Créer mon profil athlète'}
        </button>
      </div>
    </Layout>
  )
}
