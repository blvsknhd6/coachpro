import { supabase } from './supabase'

export const DEFAULT_ATHLETE_WIDGETS = [
  { id: 'next_seance', label: 'Prochaine séance', enabled: true },
  { id: 'streak', label: 'Jours consécutifs', enabled: true },
  { id: 'kcal_today', label: 'Kcal aujourd\'hui', enabled: true },
  { id: 'sport_today', label: 'Sport aujourd\'hui', enabled: true },
  { id: 'nutrition_ia', label: 'Saisie repas IA', enabled: true },
  { id: 'macros_bars', label: 'Barres macros', enabled: true },
  { id: 'week_seances', label: 'Séances de la semaine', enabled: true },
  { id: 'avg_kcal_week', label: 'Kcal moyennes semaine', enabled: false },
  { id: 'poids_trend', label: 'Tendance poids', enabled: false },
]

export const DEFAULT_COACH_WIDGETS = [
  { id: 'next_seance', label: 'Ma prochaine séance', enabled: true },
  { id: 'athletes_count', label: 'Nb coachés', enabled: true },
  { id: 'week_sessions', label: 'Séances cette semaine', enabled: true },
  { id: 'inactifs', label: 'Alertes inactivité', enabled: true },
  { id: 'athletes_list', label: 'Liste coachés', enabled: true },
]

export const DEFAULT_PROGRESSION_CONFIG = {
  metric: 'tonnage', // 'tonnage' | 'series' | 'both'
  display: 'graph',  // 'graph' | 'table'
  fav_exercices: [], // max 5 noms d'exercices
  muscles_filter: [], // vide = tous
}

export async function loadPreferences(userId) {
  const { data } = await supabase.from('user_preferences').select('*').eq('user_id', userId).single()
  return data
}

export async function savePreferences(userId, prefs) {
  await supabase.from('user_preferences').upsert({
    user_id: userId,
    ...prefs,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}
