import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const DEFAULT_ATHLETE_WIDGETS = [
  { id: 'next_seance',    label: 'Prochaine séance',                enabled: true  },
  { id: 'streak',         label: 'Streak',                          enabled: true  },
  { id: 'macros_jour',    label: 'Macros du jour',                  enabled: true  },
  { id: 'saisie_repas',   label: 'Saisie repas IA',                 enabled: true  },
  { id: 'suivi_bloc',     label: 'Suivi du bloc (7 derniers jours)',enabled: true  },
  { id: 'semaine_seances',label: 'Séances de la semaine',           enabled: true  },
]

const DEFAULT_COACH_WIDGETS = [
  { id: 'next_seance',   label: 'Ma prochaine séance',              enabled: true  },
  { id: 'suivi_perso',   label: 'Mon suivi (7 derniers jours)',     enabled: true  },
  { id: 'macros_perso',  label: 'Mes macros du jour',               enabled: true  },
  { id: 'liste_coachés', label: 'Liste coachés',                    enabled: true  },
]

const DEPRECATED_COACH_WIDGETS = ['stats_coachés', 'alertes']

const DEFAULT_PROGRESSION_CONFIG = {
  mode:           'graphe',
  metric:         'tonnage',
  fav_exercices:  [],
  muscles_exclus: [],
}

export function usePreferences() {
  const { profile } = useAuth()
  const [prefs, setPrefs]     = useState(null)
  const [loading, setLoading] = useState(true)

  const isCoach        = profile?.role === 'coach'
  const defaultWidgets = isCoach ? DEFAULT_COACH_WIDGETS : DEFAULT_ATHLETE_WIDGETS
  const deprecated     = isCoach ? DEPRECATED_COACH_WIDGETS : []

  useEffect(() => { if (profile) loadPrefs() }, [profile])

  async function loadPrefs() {
    const { data } = await supabase
      .from('user_preferences').select('*').eq('user_id', profile.id).single()

    if (data) {
      const stored    = (data.home_widgets || []).filter(w => !deprecated.includes(w.id))
      const storedIds = stored.map(w => w.id)
      const merged    = [...stored, ...defaultWidgets.filter(w => !storedIds.includes(w.id))]
      setPrefs({
        home_widgets:       merged.length ? merged : defaultWidgets,
        progression_config: { ...DEFAULT_PROGRESSION_CONFIG, ...(data.progression_config || {}) },
      })
    } else {
      setPrefs({ home_widgets: defaultWidgets, progression_config: DEFAULT_PROGRESSION_CONFIG })
    }
    setLoading(false)
  }

  async function savePrefs(updates) {
    const newPrefs = { ...prefs, ...updates }
    setPrefs(newPrefs)
    await supabase.from('user_preferences').upsert({
      user_id:            profile.id,
      home_widgets:       newPrefs.home_widgets,
      progression_config: newPrefs.progression_config,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  function isWidgetEnabled(id) {
    if (!prefs) return true
    const w = prefs.home_widgets.find(w => w.id === id)
    return w ? w.enabled : false
  }
  function toggleWidget(id) {
    savePrefs({ home_widgets: prefs.home_widgets.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w) })
  }
  function addCustomWidget(label) {
    const id = 'custom_' + Date.now()
    savePrefs({ home_widgets: [...prefs.home_widgets, { id, label, enabled: true, custom: true }] })
    return id
  }
  function removeWidget(id) {
    savePrefs({ home_widgets: prefs.home_widgets.filter(w => w.id !== id) })
  }
  function updateProgression(updates) {
    savePrefs({ progression_config: { ...prefs.progression_config, ...updates } })
  }

  return { prefs, loading, isWidgetEnabled, toggleWidget, addCustomWidget, removeWidget, updateProgression, defaultWidgets }
}

export { DEFAULT_ATHLETE_WIDGETS, DEFAULT_COACH_WIDGETS, DEFAULT_PROGRESSION_CONFIG }
