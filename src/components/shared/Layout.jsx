import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function Layout({ children }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const isCoach = profile?.role === 'coach'
  const isFemme = profile?.genre === 'femme'
  const homeRoute = isCoach ? '/coach' : '/athlete'

  const logoColor = isFemme ? 'text-pink-600' : 'text-brand-700'

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo = retour accueil */}
            <Link to={homeRoute} className={`font-semibold text-base ${logoColor} hover:opacity-80 transition-opacity`}>
              CoachPro
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
