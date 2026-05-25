/**
 * src/lib/tonnage.js
 * Calcul du tonnage (volume) avec support des exercices au poids de corps.
 *
 * Pour un exercice classique :
 *   tonnage = charge * reps * (unilateral ? 2 : 1)
 *
 * Pour un exercice au poids de corps :
 *   - Si poids_corps_kg est renseigné sur la série (snapshot au moment de la série)
 *     → tonnage = (poids_corps_kg + charge) * reps * mult
 *   - Sinon, on cherche le poids de l'athlète depuis un cache fourni en paramètre
 *   - Si aucun poids connu : on ignore la série pour le tonnage (charge uniquement = lest)
 *
 * Le cache poidsAthletes est un Map athleteId → poids (kg).
 */

/**
 * Calcule le tonnage d'une série.
 *
 * @param {object} sr          - série réalisée : { charge, reps, poids_corps_kg }
 * @param {object} ex          - exercice        : { poids_corps, unilateral }
 * @param {number|null} athletePoids - poids de l'athlète (fallback si poids_corps_kg absent)
 * @returns {number} tonnage en kg (0 si données insuffisantes)
 */
export function calcSerieTonnage(sr, ex, athletePoids = null) {
  const reps   = Number(sr.reps)
  const charge = Number(sr.charge) || 0
  if (!reps || reps <= 0) return 0

  const mult = ex.unilateral ? 2 : 1

  if (ex.poids_corps) {
    // Poids de corps : charge = lest additionnel
    const pc = Number(sr.poids_corps_kg) || Number(athletePoids) || 0
    if (pc === 0) {
      // Aucun poids connu : on compte uniquement le lest s'il y en a
      return charge > 0 ? charge * reps * mult : 0
    }
    return (pc + charge) * reps * mult
  }

  return charge * reps * mult
}

/**
 * Agrège le tonnage d'un tableau de séries pour un exercice donné.
 *
 * @param {Array}  series       - tableau de series_realisees
 * @param {object} ex           - exercice { poids_corps, unilateral }
 * @param {number} athletePoids - poids fallback
 * @returns {number} tonnage total
 */
export function calcExerciceTonnage(series, ex, athletePoids = null) {
  return series.reduce((total, sr) => total + calcSerieTonnage(sr, ex, athletePoids), 0)
}
