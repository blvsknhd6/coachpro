import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'

export default function CoachMonProgramme() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (profile?.id) {
      // Utilise directement le profil du coach comme profil athlète
      // Pas besoin de profil séparé — les blocs sont liés à profile.id
      navigate(`/coach/athlete/${profile.id}`, { replace: true })
    }
  }, [profile])

  return (
    <Layout>
      <p className="text-gray-400 text-sm">Redirection…</p>
    </Layout>
  )
}
