/**
 * Retourne la classe CSS Tailwind pour colorier une valeur de tracking.
 *
 * @param {number|string} value     - valeur mesurée (moyenne ou journalière)
 * @param {string}        bilanKey  - clé dans le bilan : 'kcal' | 'proteines' | 'glucides' |
 *                                    'lipides' | 'sommeil' | 'pas' | 'stress' | 'seances'
 * @param {object}        objectifs - ligne objectifs_bloc (cibles du coach)
 * @param {object}        bornes    - objectifs.bornes (min/max personnalisés)
 * @returns {string} classe CSS (ex: 'text-green-600 font-medium')
 */

// Correspondance clé bilan → clé objectifs_bloc
const OBJ_KEY = {
  pas:     'pas_journaliers',
  stress:  'stress_cible',
  seances: 'seances_par_semaine',
}

// Métriques où une valeur basse est bonne (stress uniquement)
const LOWER_IS_BETTER = new Set(['stress'])

export function metricColor(value, bilanKey, objectifs, bornes) {
  const num = parseFloat(value)
  if (isNaN(num)) return ''

  const lowerIsBetter = LOWER_IS_BETTER.has(bilanKey)
  const bound = bornes?.[bilanKey]

  // ── Bornes personnalisées ────────────────────────────────
  if (bound?.min != null && bound?.max != null) {
    if (num >= bound.min && num <= bound.max) return 'text-green-600 font-medium'
    const range = Math.max(bound.max - bound.min, 1)
    const slack  = range * 0.15
    if (num >= bound.min - slack && num <= bound.max + slack) return 'text-amber-500 font-medium'
    return 'text-red-500 font-medium'
  }

  // ── Fallback : ±10 / 25 % autour de la cible ────────────
  const objKey = OBJ_KEY[bilanKey] || bilanKey
  const target = parseFloat(objectifs?.[objKey])
  if (isNaN(target) || target <= 0) return ''

  if (lowerIsBetter) {
    if (num <= target)        return 'text-green-600 font-medium'
    if (num <= target * 1.25) return 'text-amber-500 font-medium'
    return 'text-red-500 font-medium'
  }

  const ratio = num / target
  if (ratio >= 0.9 && ratio <= 1.1)  return 'text-green-600 font-medium'
  if (ratio >= 0.75 && ratio <= 1.25) return 'text-amber-500 font-medium'
  return 'text-red-500 font-medium'
}

/**
 * Calcule les moyennes d'un tableau d'entrées de tracking pour un ensemble de clés.
 * Retourne null pour les clés sans données.
 */
export function computeAverages(entries, keys) {
  const result = {}
  for (const key of keys) {
    const srcKey = key === 'pas' ? 'pas_journaliers' : key
    const vals = entries.map(e => e[srcKey]).filter(v => v != null && !isNaN(parseFloat(v)))
    result[key] = vals.length ? (vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length) : null
  }
  return result
}
