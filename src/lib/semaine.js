import { supabase } from './supabase'

/**
 * Trouve la semaine active pour un athlète dans une liste de semaines.
 * Retourne la semaine suivant la dernière avec des données (ou la dernière si c'est la fin).
 * Utilise semaine_id directement sur series_realisees — pas de confusion avec exercice_id.
 */
export async function findActiveSemaine(semaines, athleteId) {
  if (!semaines?.length) return null
  for (let i = semaines.length - 1; i >= 0; i--) {
    const { count } = await supabase
      .from('series_realisees')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('semaine_id', semaines[i].id)
    if (count > 0) {
      return semaines[i + 1] || semaines[i]
    }
  }
  return semaines[0]
}
