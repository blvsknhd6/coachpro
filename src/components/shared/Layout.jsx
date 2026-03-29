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

  const coachTabs = [
    { to: '/coach', label: 'Accueil', exact: true },
    { to: '/coach/athletes', label: 'Mes coachés' },
    { to: '/coach/mon-programme', label: 'Mon entraînement' },
  ]

  const athleteTabs = [
    { to: '/athlete', label: 'Accueil', exact: true },
    { to: '/athlete/seances', label: 'Mes séances' },
    { to: '/athlete/tracking', label: 'Mon suivi' },
    { to: '/athlete/progression', label: 'Progression' },
  ]

  const tabs = isCoach ? coachTabs : athleteTabs

  const activeColor = isFemme
    ? 'bg-pink-50 text-pink-700 font-medium'
    : 'bg-brand-50 text-brand-700 font-medium'

  const logoColor = isFemme ? 'text-pink-600' : 'text-brand-700'

  function isActive(tab) {
    if (tab.exact) return location.pathname === tab.to
    return location.pathname.startsWith(tab.to)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="h-14 flex items-center justify-between">
            <Link to={homeRoute} className={`font-semibold text-base ${logoColor} hover:opacity-80 transition-opacity`}>
              CoachPro
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
              <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                Déconnexion
              </button>
            </div>
          </div>
          {/* Onglets */}
          <nav className="flex gap-1 pb-0 overflow-x-auto scrollbar-hide">
            {tabs.map(tab => (
              <Link key={tab.to} to={tab.to}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  isActive(tab)
                    ? `border-current ${isFemme ? 'text-pink-600 border-pink-600' : 'text-brand-600 border-brand-600'} font-medium`
                    : 'text-gray-500 border-transparent hover:text-gray-800 hover:border-gray-300'
                }`}>
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
