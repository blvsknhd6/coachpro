import { getCycleStatus, PHASES } from './cycleUtils'

// Helpers
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

describe('getCycleStatus', () => {
  test('retourne null si pas de logs', () => {
    expect(getCycleStatus([])).toBeNull()
    expect(getCycleStatus(null)).toBeNull()
  })

  test('cycle régulier — phase folliculaire', () => {
    const logs = [
      { period_start_date: daysAgo(84), period_duration_days: 5 },
      { period_start_date: daysAgo(56), period_duration_days: 5 },
      { period_start_date: daysAgo(28), period_duration_days: 5 },
      // Dernier début il y a 10 jours → J11 → folliculaire
      { period_start_date: daysAgo(10), period_duration_days: 5 },
    ]
    const status = getCycleStatus(logs)
    expect(status).not.toBeNull()
    expect(status.avgCycleLength).toBe(28)
    expect(status.avgPeriodDuration).toBe(5)
    expect(status.currentPhase).toBe(PHASES.FOLLICULAR)
    expect(status.dayInCycle).toBe(11)
    expect(status.isIrregular).toBe(false)
    expect(status.isLowData).toBe(false)
  })

  test('cycle régulier — phase menstruation (J2)', () => {
    const logs = [
      { period_start_date: daysAgo(56), period_duration_days: 5 },
      { period_start_date: daysAgo(28), period_duration_days: 5 },
      { period_start_date: daysAgo(2),  period_duration_days: 5 },
    ]
    const status = getCycleStatus(logs)
    expect(status.currentPhase).toBe(PHASES.MENSTRUATION)
    expect(status.dayInCycle).toBe(3)
  })

  test('cycle régulier — phase ovulation (J14)', () => {
    const logs = [
      { period_start_date: daysAgo(56), period_duration_days: 5 },
      { period_start_date: daysAgo(28), period_duration_days: 5 },
      { period_start_date: daysAgo(14), period_duration_days: 5 },
    ]
    const status = getCycleStatus(logs)
    expect(status.currentPhase).toBe(PHASES.OVULATION)
  })

  test('cycle régulier — phase PMS (J-3)', () => {
    const logs = [
      { period_start_date: daysAgo(56), period_duration_days: 5 },
      { period_start_date: daysAgo(28), period_duration_days: 5 },
      { period_start_date: daysAgo(25), period_duration_days: 5 },
    ]
    const status = getCycleStatus(logs)
    expect(status.currentPhase).toBe(PHASES.PMS)
    expect(status.daysUntilNextPeriod).toBe(3)
  })

  test('cycle irrégulier détecté', () => {
    const logs = [
      { period_start_date: daysAgo(110), period_duration_days: 5 },
      { period_start_date: daysAgo(75),  period_duration_days: 5 }, // +35j
      { period_start_date: daysAgo(55),  period_duration_days: 5 }, // +20j
      { period_start_date: daysAgo(30),  period_duration_days: 5 }, // +25j
    ]
    const status = getCycleStatus(logs)
    expect(status.isIrregular).toBe(true)
    expect(status.cycleVariability).toBeGreaterThan(7)
  })

  test('peu de données — isLowData true', () => {
    const logs = [
      { period_start_date: daysAgo(28), period_duration_days: 5 },
      { period_start_date: daysAgo(10), period_duration_days: 5 },
    ]
    const status = getCycleStatus(logs)
    expect(status.isLowData).toBe(true)
  })

  test('durée de règles manquante — fallback 5 jours', () => {
    const logs = [
      { period_start_date: daysAgo(28), period_duration_days: null },
      { period_start_date: daysAgo(10), period_duration_days: null },
    ]
    const status = getCycleStatus(logs)
    expect(status.avgPeriodDuration).toBe(5)
  })
})