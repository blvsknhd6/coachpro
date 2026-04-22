/**
 * src/lib/tdee.js
 * Calcul du maintien calorique (TDEE) via Mifflin-St Jeor + multiplicateur d'activité.
 */

/**
 * Calcule le BMR (métabolisme de base) via Mifflin-St Jeor.
 * @param {number} poids  - en kg
 * @param {number} taille - en cm
 * @param {number} age    - en années
 * @param {string} sexe   - 'homme' | 'femme'
 */
export function calcBMR(poids, taille, age, sexe) {
  if (!poids || !taille || !age) return null
  const base = 10 * poids + 6.25 * taille - 5 * age
  return sexe === 'femme' ? base - 161 : base + 5
}

/**
 * Détermine le multiplicateur d'activité à partir des moyennes de tracking.
 * Basé sur une matrice croisée : la valeur la plus haute entre le volume de pas et les séances l'emporte.
 * @param {number} pasJournaliersMoy  - moyenne des pas sur la période
 * @param {number} seancesParSemaine  - nombre de séances par semaine sur la période
 */
export function activityMultiplier(pasJournaliersMoy, seancesParSemaine) {

  // 1. Extrêmement actif : 15 000 pas et +
  if (pasJournaliersMoy >= 15000) {
    return { mult: 1.9, label: 'Extrêmement actif' };
  }

  // 2. Très actif : 5 séances et + OU 10 000 pas et +
  if (seancesParSemaine >= 5 || pasJournaliersMoy >= 10000) {
    return { mult: 1.725, label: 'Très actif' };
  }

  // 3. Modérément actif : 4 séances et + OU 7 500 pas et +
  if (seancesParSemaine >= 4 || pasJournaliersMoy >= 7500) {
    return { mult: 1.55, label: 'Modérément actif' };
  }

  // 4. Légèrement actif : 2 séances et + OU 5 000 pas et +
  if (seancesParSemaine >= 2 || pasJournaliersMoy >= 5000) {
    return { mult: 1.375, label: 'Légèrement actif' };
  }

  // 5. Sédentaire : Moins de 2 séances ET moins de 5 000 pas (Valeur par défaut)
  return { mult: 1.2, label: 'Sédentaire' };
}

/**
 * Calcule le TDEE complet à partir des données de profil et de tracking.
 * @param {object} profile  - { poids (dernier tracking), taille, age, genre }
 * @param {object} activity - { pasJournaliersMoy, seancesParSemaine }
 * @returns {{ tdee: number, bmr: number, multiplier: number, activityLabel: string } | null}
 */
export function calcTDEE(profile, activity) {
  const { poids, taille, age, genre } = profile
  const bmr = calcBMR(poids, taille, age, genre)
  if (!bmr) return null

  const { mult, label } = activityMultiplier(
    activity.pasJournaliersMoy || 0,
    activity.seancesParSemaine || 0
  )

  return {
    tdee:          Math.round(bmr * mult),
    bmr:           Math.round(bmr),
    multiplier:    mult,
    activityLabel: label,
  }
}

/**
 * Suggestions nutritionnelles selon l'objectif.
 * @param {number} tdee
 * @param {number} poids
 * @param {string} plan - 'prise_de_masse' | 'maintien' | 'seche'
 */
export function nutritionSuggestions(tdee, poids, plan) {
  const adjustments = {
    prise_de_masse: +250,
    maintien:       0,
    seche:          -250,
  }
  const kcal = tdee + (adjustments[plan] ?? 0)

  // Répartition standard : 2.4g/kg protéines, 25% lipides, reste glucides
  const proteines = Math.round(poids * 2.4)
  const lipides   = Math.round((kcal * 0.25) / 9)
  const glucides  = Math.round((kcal - proteines * 4 - lipides * 9) / 4)

  return { kcal: Math.round(kcal), proteines, glucides, lipides }
}
