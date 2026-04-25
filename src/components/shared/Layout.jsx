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

  const isCoach   = profile?.role === 'coach'
  const isFemme   = profile?.genre === 'femme'
  const homeRoute = isCoach ? '/coach' : '/athlete'

  const coachTabs = [
    { to: '/coach',               label: 'Accueil',          exact: true },
    { to: '/coach/athletes',      label: 'Mes coachés' },
    { to: '/coach/mon-programme', label: 'Mon entraînement' },
    { to: '/coach/tracking',      label: 'Mon suivi' },
    { to: '/coach/progression',   label: 'Ma progression' },
  ]

  const athleteTabs = [
    { to: '/athlete',              label: 'Accueil',          exact: true },
    { to: '/athlete/entrainement', label: 'Mon entraînement' },
    { to: '/athlete/tracking',     label: 'Mon suivi' },
    { to: '/athlete/progression',  label: 'Ma Progression' },
  ]

  const tabs        = isCoach ? coachTabs : athleteTabs
  const accentColor = isFemme ? 'text-pink-600 border-pink-600' : 'text-brand-600 border-brand-600'
  const logoColor   = isFemme ? 'text-pink-600' : 'text-brand-700'

  function isActive(tab) {
    if (tab.exact) return location.pathname === tab.to
    return location.pathname.startsWith(tab.to)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="h-12 flex items-center justify-between">
            <Link to={homeRoute} className={`font-semibold text-base ${logoColor} hover:opacity-80 transition-opacity`}>
              MegaFit
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
              <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-700">
                Déconnexion
              </button>
            </div>
          </div>
          <nav className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
              <Link key={tab.to} to={tab.to}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  isActive(tab)
                    ? `font-medium ${accentColor}`
                    : 'text-gray-500 border-transparent hover:text-gray-800'
                }`}>
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-5">
        {children}
      </main>
    </div>
  )
}
