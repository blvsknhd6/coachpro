// Ce fichier redirige vers AthleteHome (nouvelle page d'accueil)
import { Navigate } from 'react-router-dom'
export default function AthleteDashboard() {
  return <Navigate to="/athlete" replace />
}
