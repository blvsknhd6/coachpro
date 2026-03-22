import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import CoachDashboard from './pages/coach/CoachDashboard'
import CoachAthlete from './pages/coach/CoachAthlete'
import CoachBlocEditor from './pages/coach/CoachBlocEditor'
import AthleteDashboard from './pages/athlete/AthleteDashboard'
import AthleteSeance from './pages/athlete/AthleteSeance'
import AthleteDataTracking from './pages/athlete/AthleteDataTracking'

function PrivateRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Chargement…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { profile, loading } = useAuth()

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Chargement…</div>

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Routes coach */}
      <Route path="/coach" element={<PrivateRoute role="coach"><CoachDashboard /></PrivateRoute>} />
      <Route path="/coach/athlete/:athleteId" element={<PrivateRoute role="coach"><CoachAthlete /></PrivateRoute>} />
      <Route path="/coach/bloc/:blocId/edit" element={<PrivateRoute role="coach"><CoachBlocEditor /></PrivateRoute>} />

      {/* Routes athlète */}
      <Route path="/athlete" element={<PrivateRoute role="athlete"><AthleteDashboard /></PrivateRoute>} />
      <Route path="/athlete/seance/:seanceId/semaine/:semaineId" element={<PrivateRoute role="athlete"><AthleteSeance /></PrivateRoute>} />
      <Route path="/athlete/tracking" element={<PrivateRoute role="athlete"><AthleteDataTracking /></PrivateRoute>} />

      {/* Redirection selon rôle */}
      <Route path="/" element={
        profile?.role === 'coach' ? <Navigate to="/coach" replace />
        : profile?.role === 'athlete' ? <Navigate to="/athlete" replace />
        : <Navigate to="/login" replace />
      } />
    </Routes>
  )
}
