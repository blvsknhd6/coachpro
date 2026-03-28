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

  const navLinks = isCoach
    ? [
        { to: '/coach', label: 'Mes coachés' },
        { to: '/coach/mon-programme', label: 'Mon entraînement' },
      ]
    : [
        { to: '/athlete', label: 'Mes séances' },
        { to: '/athlete/tracking', label: 'Mon suivi' },
      ]

  const activeClass = isFemme
    ? 'bg-pink-50 text-pink-700 font-medium'
    : 'bg-brand-50 text-brand-700 font-medium'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className={`font-semibold text-base ${isFemme ? 'text-pink-600' : 'text-brand-700'}`}>
              PouceTraining
            </span>
            <nav className="flex gap-1">
              {navLinks.map(l => {
                const isActive = location.pathname === l.to || location.pathname.startsWith(l.to + '/')
                return (
                  <Link key={l.to} to={l.to}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive ? activeClass : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}>
                    {l.label}
                  </Link>
                )
              })}
            </nav>
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
