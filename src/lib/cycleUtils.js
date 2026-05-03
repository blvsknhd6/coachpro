/**
 * cycleUtils.js
 * Logique de calcul des phases du cycle menstruel.
 */

export const PHASES = {
  MENSTRUATION: 'menstruation',
  FOLLICULAR:   'follicular',
  OVULATION:    'ovulation',
  LUTEAL:       'luteal',
  PMS:          'spm',
}

const PHASE_CONFIG = {
  [PHASES.MENSTRUATION]: {
    label:          'Menstruation 🌊',
    color:          'red',
    trainingAdvice: 'Privilégie la récupération active. Écoute ton corps.',
    messages: [
      'Take it easy queen. Ton corps fait un travail incroyable. 🌸',
      'Repos = performance future. Ce n\'est pas de la faiblesse, c\'est de la sagesse.',
      'Journée cocooning autorisée. Tu l\'as mérité. 🫖',
    ],
  },
  [PHASES.FOLLICULAR]: {
    label:          'Phase folliculaire ⚡',
    color:          'yellow',
    trainingAdvice: 'L\'énergie remonte, charge progressivement.',
    messages: [
      'L\'énergie revient. Time to build. 💪',
      'Phase de montée en puissance — profites-en pour progresser.',
      'Tu es dans ta phase "boss mode incoming". 🔥',
    ],
  },
  [PHASES.OVULATION]: {
    label:          'Ovulation 🔥',
    color:          'green',
    trainingAdvice: 'Performance maximale ! Idéal pour les PRs, l\'intensité lourde et l\'explosivité.',
    messages: [
      'Go Kylie go 🔥',
      'BBL energy 💀🔥 — c\'est le moment ou jamais.',
      'Ton pic de force est là. Utilise-le. Objectif BBL !',
    ],
  },
  [PHASES.LUTEAL]: {
    label:          'Phase lutéale 🍂',
    color:          'orange',
    trainingAdvice: 'Maintiens le volume, travaille la technique. Attention à la fatigue et au sommeil.',
    messages: [
      'Stabilité et technique. Chaque rep compte. 🎯',
      'Moins d\'explosivité, plus de précision. C\'est tout aussi bien.',
      'La régularité bat l\'intensité. Continue.',
    ],
  },
  [PHASES.PMS]: {
    label:          'SPM 🌙',
    color:          'purple',
    trainingAdvice: 'Reste smart. La technique > la charge.',
    messages: [
      'Si tu te sens lente, c\'est normal. Ajuste sans culpabiliser. 🫶',
      'Volume bas, qualité haute. Tu gères.',
      'Bientôt une nouvelle page. Tiens bon. 🌙',
    ],
  },
}

/**
 * Calcule l'écart-type d'un tableau de nombres.
 */
function stdDev(arr) {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const sq   = arr.map(v => (v - mean) ** 2)
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / arr.length)
}

/**
 * Différence en jours entre deux dates (b - a).
 */
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

/**
 * Ajoute N jours à une date et retourne une date ISO string.
 */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

/**
 * Retourne un message aléatoire pour une phase.
 */
function pickMessage(phase) {
  const msgs = PHASE_CONFIG[phase]?.messages || []
  return msgs[Math.floor(Math.random() * msgs.length)] || ''
}

/**
 * Calcule le statut complet du cycle à partir des logs.
 *
 * @param {Array}  periodLogs  - tableau d'objets { period_start_date, period_duration_days }
 * @param {string} todayStr    - date ISO du jour (YYYY-MM-DD), défaut = aujourd'hui
 * @returns {object|null}
 */
export function getCycleStatus(periodLogs, todayStr = new Date().toISOString().split('T')[0]) {
  if (!periodLogs?.length) return null

  // Trier par date croissante
  const sorted = [...periodLogs].sort((a, b) =>
    new Date(a.period_start_date) - new Date(b.period_start_date)
  )

  // Durées des cycles (entre entrées consécutives)
  const cycleLengths = []
  for (let i = 1; i < sorted.length; i++) {
    cycleLengths.push(daysBetween(sorted[i - 1].period_start_date, sorted[i].period_start_date))
  }

  // Durées des règles
  const periodDurations = sorted
    .map(l => l.period_duration_days)
    .filter(v => v != null && v > 0)

  const avgCycleLength    = cycleLengths.length
    ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
    : 28

  const avgPeriodDuration = periodDurations.length
    ? Math.round(periodDurations.reduce((a, b) => a + b, 0) / periodDurations.length)
    : 5

  const cycleVariability  = Math.round(stdDev(cycleLengths))
  const isIrregular       = cycleVariability > 7
  const isLowData         = sorted.length < 3

  // Date du dernier début de règles
  const lastPeriodDate    = sorted[sorted.length - 1].period_start_date

  // Prochaines règles estimées
  const predictedNextPeriodDate = addDays(lastPeriodDate, avgCycleLength)

  // Jour dans le cycle actuel (J1 = premier jour des règles)
  const dayInCycle = daysBetween(lastPeriodDate, todayStr) + 1
  const daysUntilNextPeriod = daysBetween(todayStr, predictedNextPeriodDate)

  // Jour d'ovulation estimé
  const ovulationDay = avgCycleLength - 14

  // Détermination de la phase
  let currentPhase

  if (dayInCycle >= 1 && dayInCycle <= avgPeriodDuration) {
    currentPhase = PHASES.MENSTRUATION
  } else if (daysUntilNextPeriod <= 5 && daysUntilNextPeriod >= 0) {
    currentPhase = PHASES.PMS
  } else if (dayInCycle >= ovulationDay - 1 && dayInCycle <= ovulationDay + 1) {
    currentPhase = PHASES.OVULATION
  } else if (dayInCycle > ovulationDay + 1) {
    currentPhase = PHASES.LUTEAL
  } else {
    currentPhase = PHASES.FOLLICULAR
  }

  // Si dayInCycle > avgCycleLength + 7 : cycle anormal / données obsolètes
  const isOutdated = dayInCycle > avgCycleLength + 14

  const phaseInfo = PHASE_CONFIG[currentPhase]

  // Label jour lisible
  let dayLabel
  if (daysUntilNextPeriod === 0) {
    dayLabel = 'Règles prévues aujourd\'hui'
  } else if (daysUntilNextPeriod > 0) {
    dayLabel = `J${dayInCycle} — J-${daysUntilNextPeriod} avant règles`
  } else {
    dayLabel = `J${dayInCycle} (règles en retard de ${Math.abs(daysUntilNextPeriod)}j)`
  }

  return {
    avgCycleLength,
    avgPeriodDuration,
    cycleVariability,
    isIrregular,
    isLowData,
    isOutdated,
    predictedNextPeriodDate,
    currentPhase,
    phaseLabel:        phaseInfo.label,
    phaseColor:        phaseInfo.color,
    dayInCycle,
    dayLabel,
    daysUntilNextPeriod,
    trainingAdvice:    phaseInfo.trainingAdvice,
    message:           pickMessage(currentPhase),
    nbLogs:            sorted.length,
  }
}

export { PHASE_CONFIG }