import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import CoachHome from './pages/coach/CoachHome'
import CoachAthletes from './pages/coach/CoachAthletes'
import CoachAthlete from './pages/coach/CoachAthlete'
import CoachBlocEditor from './pages/coach/CoachBlocEditor'
import CoachAthleteView from './pages/coach/CoachAthleteView'
import CoachMyTraining from './pages/coach/CoachMyTraining'
import AthleteHome from './pages/athlete/AthleteHome'
import AthleteEntrainement from './pages/athlete/AthleteEntrainement'
import AthleteSeance from './pages/athlete/AthleteSeance'
import AthleteDataTracking from './pages/athlete/AthleteDataTracking'
import AthleteProgression from './pages/athlete/AthleteProgression'

function PrivateRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Chargement…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Chargement…</div>

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/coach" element={<PrivateRoute role="coach"><CoachHome /></PrivateRoute>} />
      <Route path="/coach/athletes" element={<PrivateRoute role="coach"><CoachAthletes /></PrivateRoute>} />
      <Route path="/coach/mon-programme" element={<PrivateRoute role="coach"><CoachMyTraining /></PrivateRoute>} />
      <Route path="/coach/athlete/:athleteId" element={<PrivateRoute role="coach"><CoachAthlete /></PrivateRoute>} />
      <Route path="/coach/athlete/:athleteId/view" element={<PrivateRoute role="coach"><CoachAthleteView /></PrivateRoute>} />
      <Route path="/coach/bloc/:blocId/edit" element={<PrivateRoute role="coach"><CoachBlocEditor /></PrivateRoute>} />
      {/* Route séance pour l'entraînement personnel du coach */}
      <Route path="/coach/my-training/seance/:seanceId/semaine/:semaineId" element={<PrivateRoute role="coach"><AthleteSeance /></PrivateRoute>} />
      {/* Suivi quotidien personnel du coach */}
      <Route path="/coach/tracking" element={<PrivateRoute role="coach"><AthleteDataTracking /></PrivateRoute>} />
      <Route path="/athlete" element={<PrivateRoute role="athlete"><AthleteHome /></PrivateRoute>} />
      <Route path="/athlete/entrainement" element={<PrivateRoute role="athlete"><AthleteEntrainement /></PrivateRoute>} />
      <Route path="/athlete/tracking" element={<PrivateRoute role="athlete"><AthleteDataTracking /></PrivateRoute>} />
      <Route path="/athlete/progression" element={<PrivateRoute role="athlete"><AthleteProgression /></PrivateRoute>} />
      <Route path="/athlete/seance/:seanceId/semaine/:semaineId" element={<PrivateRoute><AthleteSeance /></PrivateRoute>} />
      <Route path="/" element={
        profile?.role === 'coach' ? <Navigate to="/coach" replace />
        : profile?.role === 'athlete' ? <Navigate to="/athlete" replace />
        : <Navigate to="/login" replace />
      } />
    </Routes>
  )
}
