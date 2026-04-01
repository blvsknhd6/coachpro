import { supabase } from './supabase'

/**
 * Vérifie si toutes les séances (hors Bonus) d'une semaine ont au moins un exercice réalisé.
 * "Réalisé" = au moins une série avec reps ou charge renseignée.
 */
async function isSemaineComplete(semaineId, athleteId) {
  const { data: seances } = await supabase
    .from('seances')
    .select('id')
    .eq('semaine_id', semaineId)
    .neq('nom', 'Bonus')

  if (!seances?.length) return false

  const { data: exercices } = await supabase
    .from('exercices')
    .select('id')
    .in('seance_id', seances.map(s => s.id))

  if (!exercices?.length) return false

  const { data: seriesRealisees } = await supabase
    .from('series_realisees')
    .select('exercice_id')
    .eq('athlete_id', athleteId)
    .eq('semaine_id', semaineId)
    .in('exercice_id', exercices.map(e => e.id))

  const exosRealises = new Set((seriesRealisees || []).map(s => s.exercice_id))
  return exosRealises.size >= exercices.length
}

/**
 * Trouve la semaine active pour un athlète.
 *
 * Logique :
 * - On cherche la dernière semaine ayant de l'activité (en partant de la fin).
 * - Si cette semaine est entièrement complétée (tous les exercices ont au moins une série),
 *   on passe à la semaine suivante.
 * - Si la semaine est commencée mais pas terminée, on reste dessus.
 * - Si aucune activité, on retourne la semaine 1.
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
      const complete = await isSemaineComplete(semaines[i].id, athleteId)

      if (complete && semaines[i + 1]) {
        return semaines[i + 1]
      }
      return semaines[i]
    }
  }

  return semaines[0]
}
