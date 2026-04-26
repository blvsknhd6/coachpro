/**
 * src/lib/tdee.js
 * Calcul du maintien calorique (TDEE) via Mifflin-St Jeor + multiplicateur d'activité.
 */

/**
 * Calcule l'âge en années à partir d'une date de naissance ISO (YYYY-MM-DD).
 */
export function ageFromDateNaissance(dateNaissance) {
  if (!dateNaissance) return null
  const today = new Date()
  const dob   = new Date(dateNaissance)
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--
  return age > 0 ? age : null
}

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
 * Détermine le multiplicateur d'activité.
 *
 * @param {number}  pasJournaliersMoy  - moyenne de pas par jour
 * @param {number}  seancesParSemaine  - nombre de séances sport par semaine
 * @param {boolean} travailPhysique    - true si métier physique (maçon, infirmière…)
 *
 * Le travail physique monte le plancher d'une catégorie entière :
 *   - Sédentaire  → Légèrement actif  (×1.375)
 *   - Légèrement  → Modérément actif  (×1.55)
 *   - Modérément  → Actif             (×1.725)
 *   - Très actif  → Très actif+       (×1.9)
 */
export function activityMultiplier(pasJournaliersMoy, seancesParSemaine, travailPhysique = false) {
  const tresTactif = seancesParSemaine >= 5 || pasJournaliersMoy >= 12000
  const actif      = seancesParSemaine >= 4 || pasJournaliersMoy >= 10000
  const moderement = seancesParSemaine >= 3 || pasJournaliersMoy >= 7500
  const legerement = seancesParSemaine >= 2 || pasJournaliersMoy >= 5000

  if (tresTactif) {
    return travailPhysique
      ? { mult: 1.9,   label: 'Très actif + travail physique' }
      : { mult: 1.725, label: 'Très actif' }
  }
  if (actif || moderement) {
    return travailPhysique
      ? { mult: 1.725, label: 'Actif + travail physique' }
      : { mult: 1.55,  label: 'Modérément actif' }
  }
  if (legerement) {
    return travailPhysique
      ? { mult: 1.55,  label: 'Modérément actif + travail physique' }
      : { mult: 1.375, label: 'Légèrement actif' }
  }
  // Sédentaire
  return travailPhysique
    ? { mult: 1.375, label: 'Légèrement actif + travail physique' }
    : { mult: 1.2,   label: 'Sédentaire' }
}

/**
 * Calcule le TDEE complet.
 * @param {object} profile  - { poids, taille, date_naissance, genre, travail_physique? }
 * @param {object} activity - { pasJournaliersMoy, seancesParSemaine }
 */
export function calcTDEE(profile, activity) {
  const { poids, taille, date_naissance, genre, travail_physique } = profile
  const age = ageFromDateNaissance(date_naissance)
  const bmr = calcBMR(poids, taille, age, genre)
  if (!bmr) return null

  const { mult, label } = activityMultiplier(
    activity.pasJournaliersMoy  || 0,
    activity.seancesParSemaine  || 0,
    travail_physique            || false
  )

  return {
    tdee:          Math.round(bmr * mult),
    bmr:           Math.round(bmr),
    multiplier:    mult,
    activityLabel: label,
    age,
  }
}

/**
 * Suggestions nutritionnelles selon l'objectif.
 */
export function nutritionSuggestions(tdee, poids, plan) {
  const adjustments = { prise_de_masse: +250, maintien: 0, seche: -350 }
  const kcal      = tdee + (adjustments[plan] ?? 0)
  const proteines = Math.round(poids * 2.4)
  const lipides   = Math.round((kcal * 0.25) / 9)
  const glucides  = Math.round((kcal - proteines * 4 - lipides * 9) / 4)
  return { kcal: Math.round(kcal), proteines, glucides, lipides }
}
