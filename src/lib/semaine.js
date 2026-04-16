import { supabase } from './supabase'

/**
 * Vérifie si toutes les séances (hors Bonus) d'une semaine ont au moins un exercice réalisé.
 * Accepte en option les series_realisees déjà fetchées pour éviter une requête supplémentaire.
 */
async function isSemaineComplete(semaineId, athleteId, existingSr = null) {
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

  const exoIds = new Set(exercices.map(e => e.id))

  // Réutiliser les sr déjà fetchés si possible
  let srFiltered
  if (existingSr) {
    srFiltered = existingSr.filter(s => s.semaine_id === semaineId && exoIds.has(s.exercice_id))
  } else {
    const { data } = await supabase
      .from('series_realisees')
      .select('exercice_id')
      .eq('athlete_id', athleteId)
      .eq('semaine_id', semaineId)
      .in('exercice_id', [...exoIds])
    srFiltered = data || []
  }

  const exosRealises = new Set(srFiltered.map(s => s.exercice_id))
  return exosRealises.size >= exercices.length
}

/**
 * Trouve la semaine active pour un athlète.
 * Version batch : une seule requête series_realisees pour toutes les semaines,
 * puis traitement côté JS pour éviter les boucles séquentielles.
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

  const semIds = semaines.map(s => s.id)

  // Une seule requête pour savoir quelles semaines ont de l'activité
  const { data: sr } = await supabase
    .from('series_realisees')
    .select('semaine_id, exercice_id')
    .eq('athlete_id', athleteId)
    .in('semaine_id', semIds)

  if (!sr?.length) return semaines[0]

  const semainesAvecActivite = new Set(sr.map(s => s.semaine_id))

  // Trouver la dernière semaine avec activité en partant de la fin
  let derniere = null
  let derniereIdx = -1
  for (let i = semaines.length - 1; i >= 0; i--) {
    if (semainesAvecActivite.has(semaines[i].id)) {
      derniere = semaines[i]
      derniereIdx = i
      break
    }
  }

  if (!derniere) return semaines[0]

  // Vérifier si cette semaine est complète en réutilisant les sr déjà fetchés
  const complete = await isSemaineComplete(derniere.id, athleteId, sr)

  if (complete && semaines[derniereIdx + 1]) {
    return semaines[derniereIdx + 1]
  }
  return derniere
}
