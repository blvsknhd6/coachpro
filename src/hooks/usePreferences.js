import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const DEFAULT_ATHLETE_WIDGETS = [
  { id: 'next_seance', label: 'Prochaine séance', enabled: true },
  { id: 'streak', label: 'Streak', enabled: true },
  { id: 'macros_jour', label: 'Macros du jour', enabled: true },
  { id: 'saisie_repas', label: 'Saisie repas IA', enabled: true },
  { id: 'semaine_seances', label: 'Séances de la semaine', enabled: true },
]

const DEFAULT_COACH_WIDGETS = [
  { id: 'next_seance', label: 'Ma prochaine séance', enabled: true },
  { id: 'stats_coachés', label: 'Stats coachés', enabled: true },
  { id: 'alertes', label: 'Alertes inactivité', enabled: true },
  { id: 'liste_coachés', label: 'Liste coachés', enabled: true },
]

const DEFAULT_PROGRESSION_CONFIG = {
  mode: 'graphe', // 'graphe' | 'tableau' | 'les_deux'
  metric: 'tonnage', // 'tonnage' | 'series' | 'les_deux'
  fav_exercices: [],
  muscles_exclus: [],
}

export function usePreferences() {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)

  const isCoach = profile?.role === 'coach'
  const defaultWidgets = isCoach ? DEFAULT_COACH_WIDGETS : DEFAULT_ATHLETE_WIDGETS

  useEffect(() => {
    if (profile) loadPrefs()
  }, [profile])

  async function loadPrefs() {
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', profile.id)
      .single()

    if (data) {
      // 1. Récupération des widgets stockés
      const storedWidgets = data.home_widgets || []
      
      // 2. Nettoyage : On ne garde que les widgets "custom" 
      // ou ceux qui existent dans les widgets par défaut du rôle actuel
      const validStoredWidgets = storedWidgets.filter(w => 
        w.custom || defaultWidgets.some(dw => dw.id === w.id)
      )

      const validStoredIds = validStoredWidgets.map(w => w.id)

      // 3. Fusion : On ajoute les widgets par défaut qui ne sont pas encore sauvegardés
      const mergedWidgets = [
        ...validStoredWidgets,
        ...defaultWidgets.filter(w => !validStoredIds.includes(w.id))
      ]

      setPrefs({
        home_widgets: mergedWidgets,
        progression_config: { ...DEFAULT_PROGRESSION_CONFIG, ...(data.progression_config || {}) },
      })
    } else {
      // Aucun réglage en base, on applique les réglages par défaut
      setPrefs({
        home_widgets: defaultWidgets,
        progression_config: DEFAULT_PROGRESSION_CONFIG,
      })
    }
    setLoading(false)
  }

  async function savePrefs(updates) {
    const newPrefs = { ...prefs, ...updates }
    setPrefs(newPrefs)
    await supabase.from('user_preferences').upsert({
      user_id: profile.id,
      home_widgets: newPrefs.home_widgets,
      progression_config: newPrefs.progression_config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  function isWidgetEnabled(id) {
    if (!prefs) return true
    const w = prefs.home_widgets.find(w => w.id === id)
    return w ? w.enabled : false
  }

  function toggleWidget(id) {
    const widgets = prefs.home_widgets.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w)
    savePrefs({ home_widgets: widgets })
  }

  function addCustomWidget(label) {
    const id = 'custom_' + Date.now()
    const widgets = [...prefs.home_widgets, { id, label, enabled: true, custom: true }]
    savePrefs({ home_widgets: widgets })
    return id
  }

  function removeWidget(id) {
    const widgets = prefs.home_widgets.filter(w => w.id !== id)
    savePrefs({ home_widgets: widgets })
  }

  function updateProgression(updates) {
    savePrefs({ progression_config: { ...prefs.progression_config, ...updates } })
  }

  return {
    prefs, loading,
    isWidgetEnabled, toggleWidget, addCustomWidget, removeWidget,
    updateProgression,
    defaultWidgets,
  }
}

export { DEFAULT_ATHLETE_WIDGETS, DEFAULT_COACH_WIDGETS, DEFAULT_PROGRESSION_CONFIG }