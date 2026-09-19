import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { metricColor } from '../../lib/tracking'

function today() { return new Date().toISOString().split('T')[0] }

function emptyAddForm() {
  return {
    date: today(),
    sport_fait: false,
    kcal: '', proteines: '', glucides: '', lipides: '',
    sommeil: '', pas_journaliers: '', stress: '', poids: '',
  }
}

export default function RecapTracking({ athleteId, blocId, coachMode = false }) {
  const [data, setData]             = useState([])
  const [objectifs, setObjectifs]   = useState(null)
  const [historique, setHistorique] = useState([])
  const [semaines, setSemaines]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editForm, setEditForm]         = useState({})
  const [saving, setSaving]             = useState(false)

  // Ajout manuel d'une entrée (coach)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [addForm, setAddForm]           = useState(emptyAddForm())
  const [addSaving, setAddSaving]       = useState(false)
  const [addError, setAddError]         = useState('')

  // Graphiques continus (tous blocs confondus) — indépendants du bloc affiché
  const [globalPoidsData, setGlobalPoidsData]   = useState([])
  const [globalKcalWeekly, setGlobalKcalWeekly] = useState([])
  const [blocsTimeline, setBlocsTimeline]       = useState([])
  const [loadingGlobal, setLoadingGlobal]       = useState(true)

  useEffect(() => { fetchData() }, [blocId])
  useEffect(() => { if (athleteId) fetchGlobalData() }, [athleteId])

  async function fetchData() {
    setLoading(true)
    const [
      { data: tracking },
      { data: obj },
      { data: sems },
      { data: hist },
    ] = await Promise.all([
      supabase.from('data_tracking').select('*')
        .eq('athlete_id', athleteId).eq('bloc_id', blocId).order('date'),
      supabase.from('objectifs_bloc').select('*').eq('bloc_id', blocId).single(),
      supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero'),
      supabase.from('objectifs_bloc_historique')
        .select('*').eq('bloc_id', blocId).order('date_debut', { ascending: true }),
    ])
    setData(tracking || [])
    setObjectifs(obj)
    setSemaines(sems || [])
    setHistorique(hist || [])
    setLoading(false)
  }

  /**
   * Récupère les graphiques Poids & Kcal continus, tous blocs confondus,
   * pour que la progression de l'athlète ne soit pas coupée à chaque
   * changement de bloc. Indépendant du blocId affiché — ne se recharge
   * que quand on change d'athlète, pas quand on change d'onglet bloc.
   */
  async function fetchGlobalData() {
    setLoadingGlobal(true)
    const [{ data: allBlocs }, { data: allTracking }] = await Promise.all([
      supabase.from('blocs').select('id, name, created_at').eq('athlete_id', athleteId).order('created_at', { ascending: true }),
      supabase.from('data_tracking').select('*').eq('athlete_id', athleteId).order('date', { ascending: true }),
    ])

    const blocsList    = allBlocs || []
    const trackingList = allTracking || []

    // Poids : tous les points renseignés, toutes dates confondues
    setGlobalPoidsData(
      trackingList.filter(d => d.poids).map(d => ({ date: d.date, poids: d.poids }))
    )

    // Kcal : moyenne par semaine calendaire (lundi → dimanche), continue entre les blocs
    const weekMap = {}
    trackingList.forEach(d => {
      if (d.kcal == null) return
      const dt = new Date(d.date + 'T12:00:00')
      const day = dt.getDay() // 0 = dimanche
      const diffToMonday = day === 0 ? 6 : day - 1
      const monday = new Date(dt)
      monday.setDate(dt.getDate() - diffToMonday)
      const weekStart = monday.toISOString().split('T')[0]
      if (!weekMap[weekStart]) weekMap[weekStart] = { total: 0, count: 0 }
      weekMap[weekStart].total += Number(d.kcal)
      weekMap[weekStart].count += 1
    })
    setGlobalKcalWeekly(
      Object.entries(weekMap)
        .sort((a, b) => new Date(a[0]) - new Date(b[0]))
        .map(([weekStart, { total, count }]) => ({
          weekStart,
          semaine: new Date(weekStart + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
          kcal: Math.round(total / count),
        }))
    )

    // Timeline des blocs : date de la première donnée de tracking de chaque bloc
    // (fallback sur created_at si le bloc n'a encore aucune donnée)
    const timeline = blocsList
      .map(b => {
        const firstEntry = trackingList.find(t => t.bloc_id === b.id)
        const startDate = firstEntry?.date || b.created_at?.split('T')[0]
        return { id: b.id, name: b.name, startDate }
      })
      .filter(b => b.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    setBlocsTimeline(timeline)

    setLoadingGlobal(false)
  }

  /**
   * Retourne les objectifs en vigueur à une date donnée.
   *
   * Stratégie :
   *   1. Cherche dans l'historique la dernière entrée dont date_debut <= dateStr
   *   2. Fallback sur objectifs_bloc courants
   *
   * L'historique est trié par date_debut ASC : on cherche le dernier
   * dont date_debut <= dateStr (donc on itère en sens inverse).
   */
  function getObjectifsAt(dateStr) {
    if (!dateStr) return objectifs
    // historique trié ASC → on cherche le dernier applicable
    let applicable = null
    for (const h of historique) {
      if (h.date_debut <= dateStr) applicable = h
      else break
    }
    return applicable || objectifs
  }

  /**
   * Calcule le bilan par semaine.
   *
   * Stratégie de correspondance date ↔ semaine :
   *   A. Si la semaine a date_debut renseignée : on utilise les 7 jours
   *      à partir de date_debut (jusqu'à date_debut + 6 jours).
   *   B. Sinon (fallback) : offset en jours depuis la première entrée de tracking.
   *
   * Pour chaque semaine, on retient la date médiane pour aller chercher
   * les objectifs historiques corrects.
   */
  function bilanSemaines() {
    if (!semaines.length || !data.length) return []
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))

    // Cas A : semaines avec date_debut
    const semainesAvecDates = semaines.filter(s => s.date_debut)

    if (semainesAvecDates.length > 0) {
      return semaines.map((sem, i) => {
        let jours
        if (sem.date_debut) {
          const debut = new Date(sem.date_debut + 'T12:00:00')
          const fin   = new Date(sem.date_debut + 'T12:00:00')
          fin.setDate(fin.getDate() + 6)
          const debutStr = sem.date_debut
          const finStr   = fin.toISOString().split('T')[0]
          jours = sorted.filter(d => d.date >= debutStr && d.date <= finStr)
        } else {
          // semaine sans date : on l'ignore dans le bilan
          return null
        }

        if (!jours.length) return null

        const avg = (key) => {
          const srcKey = key === 'pas' ? 'pas_journaliers' : key
          const vals = jours.map(j => j[srcKey]).filter(v => v != null)
          return vals.length ? (vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length).toFixed(1) : null
        }

        // Date médiane pour les objectifs historiques
        const midDate = jours[Math.floor(jours.length / 2)]?.date

        return {
          name:      `S${sem.numero}`,
          midDate,
          dateDebut: sem.date_debut,
          kcal:      avg('kcal'),
          proteines: avg('proteines'),
          glucides:  avg('glucides'),
          lipides:   avg('lipides'),
          sommeil:   avg('sommeil'),
          pas:       avg('pas'),
          stress:    avg('stress'),
          sport:     jours.filter(j => j.sport_fait).length,
        }
      }).filter(Boolean)
    }

    // Cas B : fallback offset depuis firstDate
    const firstDate = sorted[0] ? new Date(sorted[0].date) : null
    if (!firstDate) return []

    return semaines.map((sem, i) => {
      const startDay = i * 7
      const endDay   = startDay + 6
      const jours = sorted.filter(d => {
        const dayNum = Math.floor((new Date(d.date) - firstDate) / 86400000)
        return dayNum >= startDay && dayNum <= endDay
      })

      const avg = (key) => {
        const srcKey = key === 'pas' ? 'pas_journaliers' : key
        const vals = jours.map(j => j[srcKey]).filter(v => v != null)
        return vals.length ? (vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length).toFixed(1) : null
      }

      const midDate = jours.length ? jours[Math.floor(jours.length / 2)]?.date : null

      return {
        name:      `S${sem.numero}`,
        midDate,
        dateDebut: null,
        kcal:      avg('kcal'),
        proteines: avg('proteines'),
        glucides:  avg('glucides'),
        lipides:   avg('lipides'),
        sommeil:   avg('sommeil'),
        pas:       avg('pas'),
        stress:    avg('stress'),
        sport:     jours.filter(j => j.sport_fait).length,
      }
    }).filter(s => s.kcal !== null || s.sport > 0)
  }

  async function saveEntry() {
    setSaving(true)
    await supabase.from('data_tracking').update({
      sport_fait:      editForm.sport_fait,
      kcal:            editForm.kcal            || null,
      proteines:       editForm.proteines        || null,
      glucides:        editForm.glucides         || null,
      lipides:         editForm.lipides          || null,
      sommeil:         editForm.sommeil          || null,
      pas_journaliers: editForm.pas_journaliers  || null,
      stress:          editForm.stress           || null,
      poids:           editForm.poids            || null,
    }).eq('id', editingEntry)
    setEditingEntry(null)
    fetchData()
    fetchGlobalData()
    setSaving(false)
  }

  // ── Ajout manuel d'une entrée journalière (coach) ─────────────────
  function openAddEntry() {
    setAddForm(emptyAddForm())
    setAddError('')
    setShowAddEntry(true)
  }

  // Si la date choisie correspond à une entrée existante, on pré-remplit
  // avec ses valeurs pour éviter d'écraser des données sans le voir.
  function handleAddDateChange(dateVal) {
    const existing = data.find(d => d.date === dateVal)
    setAddForm(existing ? {
      date:            dateVal,
      sport_fait:      existing.sport_fait      || false,
      kcal:            existing.kcal            ?? '',
      proteines:       existing.proteines       ?? '',
      glucides:        existing.glucides        ?? '',
      lipides:         existing.lipides         ?? '',
      sommeil:         existing.sommeil         ?? '',
      pas_journaliers: existing.pas_journaliers ?? '',
      stress:          existing.stress          ?? '',
      poids:           existing.poids           ?? '',
    } : { ...emptyAddForm(), date: dateVal })
  }

  async function saveNewEntry() {
    if (!addForm.date) { setAddError('La date est requise.'); return }
    setAddSaving(true)
    setAddError('')
    const { error } = await supabase.from('data_tracking').upsert({
      athlete_id:      athleteId,
      bloc_id:         blocId,
      date:            addForm.date,
      sport_fait:      addForm.sport_fait,
      kcal:            addForm.kcal            || null,
      proteines:       addForm.proteines        || null,
      glucides:        addForm.glucides         || null,
      lipides:         addForm.lipides          || null,
      sommeil:         addForm.sommeil          || null,
      pas_journaliers: addForm.pas_journaliers  || null,
      stress:          addForm.stress           || null,
      poids:           addForm.poids            || null,
    }, { onConflict: 'athlete_id,date' })

    if (error) { setAddError(error.message); setAddSaving(false); return }

    setShowAddEntry(false)
    await fetchData()
    await fetchGlobalData()
    setAddSaving(false)
  }

  const bilans = bilanSemaines()

  // Couleur d'une cellule : utilise les objectifs en vigueur à la date de la semaine
  function cc(value, key, midDate) {
    const obj = getObjectifsAt(midDate)
    const b   = obj?.bornes || {}
    return metricColor(value, key, obj, b)
  }

  const fmt = (v, isInt = false) =>
    v == null ? '—' : isInt ? Math.round(v) : parseFloat(v).toFixed(1).replace(/\.0$/, '')

  // Détecte si les objectifs changent entre deux semaines (pour afficher un indicateur)
  function getChangeLabel(midDate) {
    if (!midDate || historique.length <= 1) return null
    // On cherche si une entrée historique tombe dans la semaine courante
    const semDebut = bilans.find(b => b.midDate === midDate)?.dateDebut
    if (!semDebut) return null
    const semFin = (() => {
      const d = new Date(semDebut + 'T12:00:00'); d.setDate(d.getDate() + 6)
      return d.toISOString().split('T')[0]
    })()
    const changeDansSemaine = historique.find(h => h.date_debut >= semDebut && h.date_debut <= semFin)
    return changeDansSemaine ? { date: changeDansSemaine.date_debut, obj: changeDansSemaine } : null
  }

  function blocChipDate(dateStr, i) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: i === 0 ? undefined : '2-digit',
    })
  }

  if (loading) return <p className="text-sm text-gray-400">Chargement du suivi…</p>

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Suivi du bloc</h3>

      {editingEntry && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-4">Modifier l'entrée</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['kcal','Kcal'], ['proteines','Protéines (g)'], ['glucides','Glucides (g)'],
                ['lipides','Lipides (g)'], ['sommeil','Sommeil (h)'], ['pas_journaliers','Pas'],
                ['stress','Stress /10'], ['poids','Poids (kg)'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type="number" value={editForm[key] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={editForm.sport_fait || false}
                    onChange={e => setEditForm(f => ({ ...f, sport_fait: e.target.checked }))}
                    className="rounded"
                  />
                  Sport fait ce jour
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEntry} disabled={saving}
                className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setEditingEntry(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showAddEntry && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-1">Ajouter une entrée</h3>
            <p className="text-xs text-gray-400 mb-4">Renseigne les données pour une date — les champs vides resteront vides.</p>

            <div className="mb-3">
              <label className="text-xs text-gray-500">Date</label>
              <input type="date" value={addForm.date} max={today()}
                onChange={e => handleAddDateChange(e.target.value)}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {data.some(d => d.date === addForm.date) && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Une entrée existe déjà pour cette date — elle sera mise à jour avec les valeurs ci-dessous.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['kcal','Kcal'], ['proteines','Protéines (g)'], ['glucides','Glucides (g)'],
                ['lipides','Lipides (g)'], ['sommeil','Sommeil (h)'], ['pas_journaliers','Pas'],
                ['stress','Stress /10'], ['poids','Poids (kg)'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type="number" value={addForm[key] || ''}
                    onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={addForm.sport_fait || false}
                    onChange={e => setAddForm(f => ({ ...f, sport_fait: e.target.checked }))}
                    className="rounded"
                  />
                  Sport fait ce jour
                </label>
              </div>
            </div>

            {addError && <p className="text-xs text-red-500 mt-3">{addError}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={saveNewEntry} disabled={addSaving}
                className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {addSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setShowAddEntry(false)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Tableau résumé par semaine — spécifique au bloc actif */}
      {bilans.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune donnée saisie pour ce bloc pour l'instant.</p>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="text-left px-4 py-3 font-medium">Semaine</th>
                <th className="px-3 py-3 font-medium text-right">Sport</th>
                <th className="px-3 py-3 font-medium text-right">Kcal</th>
                <th className="px-3 py-3 font-medium text-right">P</th>
                <th className="px-3 py-3 font-medium text-right">G</th>
                <th className="px-3 py-3 font-medium text-right">L</th>
                <th className="px-3 py-3 font-medium text-right">Sommeil</th>
                <th className="px-3 py-3 font-medium text-right">Pas</th>
                <th className="px-3 py-3 font-medium text-right">Stress</th>
              </tr>
            </thead>
            <tbody>
              {bilans.map((b, idx) => {
                const objSemaine = getObjectifsAt(b.midDate)
                const bornes     = objSemaine?.bornes || {}
                const change     = getChangeLabel(b.midDate)

                // Ligne d'objectifs si changement détecté dans cette semaine
                const showObjRow = change !== null

                return (
                  <>
                    {showObjRow && (
                      <tr key={`obj-${b.name}`} className="border-b border-gray-50 bg-amber-50/60">
                        <td className="px-4 py-1.5 text-xs text-amber-600 font-medium" colSpan={9}>
                          📋 Objectifs modifiés le {new Date(change.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {change.obj.plan_nutritionnel && (
                            <span className="ml-2">
                              {{'prise_de_masse':'💪 Prise de masse','maintien':'⚖️ Maintien','seche':'🔥 Sèche'}[change.obj.plan_nutritionnel]}
                            </span>
                          )}
                          {change.obj.kcal && <span className="ml-2 text-gray-500">{change.obj.kcal} kcal/j</span>}
                        </td>
                      </tr>
                    )}
                    <tr key={b.name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {b.name}
                        {b.dateDebut && (
                          <span className="ml-1.5 text-xs text-gray-300">
                            {new Date(b.dateDebut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-3 text-right ${cc(b.sport, 'seances', b.midDate)}`}>{b.sport}j</td>
                      <td className={`px-3 py-3 text-right ${cc(b.kcal, 'kcal', b.midDate)}`}>{fmt(b.kcal, true)}</td>
                      <td className={`px-3 py-3 text-right ${cc(b.proteines, 'proteines', b.midDate)}`}>{fmt(b.proteines)}</td>
                      <td className={`px-3 py-3 text-right ${cc(b.glucides, 'glucides', b.midDate)}`}>{fmt(b.glucides)}</td>
                      <td className={`px-3 py-3 text-right ${cc(b.lipides, 'lipides', b.midDate)}`}>{fmt(b.lipides)}</td>
                      <td className={`px-3 py-3 text-right ${cc(b.sommeil, 'sommeil', b.midDate)}`}>{fmt(b.sommeil)}h</td>
                      <td className={`px-3 py-3 text-right ${cc(b.pas, 'pas', b.midDate)}`}>
                        {b.pas ? Math.round(b.pas).toLocaleString('fr') : '—'}
                      </td>
                      <td className={`px-3 py-3 text-right ${cc(b.stress, 'stress', b.midDate)}`}>{fmt(b.stress)}/10</td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Légende historique si plusieurs phases — indépendant des bilans */}
      {historique.length > 1 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 mb-2">Historique des objectifs</p>
          <div className="space-y-1">
            {[...historique].reverse().map((h, i) => (
              <div key={h.id} className="flex items-center gap-3 text-xs text-gray-600">
                <span className="text-gray-400 w-24 flex-shrink-0">
                  {new Date(h.date_debut + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>
                {h.plan_nutritionnel && (
                  <span className="font-medium">
                    {{'prise_de_masse':'💪 Prise','maintien':'⚖️ Maintien','seche':'🔥 Sèche'}[h.plan_nutritionnel]}
                  </span>
                )}
                {h.kcal && <span>{h.kcal} kcal</span>}
                {h.proteines && <span>P{h.proteines}g</span>}
                {h.glucides  && <span>G{h.glucides}g</span>}
                {h.lipides   && <span>L{h.lipides}g</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entrées journalières modifiables + ajout manuel (mode coach) — indépendant des bilans */}
      {coachMode && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium text-gray-700">Entrées journalières</h4>
            <div className="flex items-center gap-3">
              {data.length > 0 && (
                <span className="text-xs text-gray-400 hidden sm:inline">Cliquez sur une ligne pour modifier</span>
              )}
              <button onClick={openAddEntry}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium border border-brand-200 rounded-lg px-2.5 py-1.5 hover:bg-brand-50 transition-colors flex-shrink-0">
                + Ajouter une entrée
              </button>
            </div>
          </div>
          {data.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-6 text-center">Aucune entrée pour ce bloc pour l'instant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-50">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="px-3 py-2">Sport</th>
                    <th className="px-3 py-2">Kcal</th>
                    <th className="px-3 py-2">P</th>
                    <th className="px-3 py-2">G</th>
                    <th className="px-3 py-2">L</th>
                    <th className="px-3 py-2">Sommeil</th>
                    <th className="px-3 py-2">Pas</th>
                    <th className="px-3 py-2">Stress</th>
                    <th className="px-3 py-2">Poids</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => {
                    const objE = getObjectifsAt(e.date)
                    const bE   = objE?.bornes || {}
                    return (
                      <tr key={e.id}
                        onClick={() => { setEditingEntry(e.id); setEditForm({ ...e }) }}
                        className="border-b border-gray-50 hover:bg-brand-50 cursor-pointer transition-colors">
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                          {new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-3 py-2 text-center">{e.sport_fait ? '✓' : '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.kcal,            'kcal',      objE, bE)}`}>{e.kcal ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.proteines,       'proteines', objE, bE)}`}>{e.proteines ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.glucides,        'glucides',  objE, bE)}`}>{e.glucides ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.lipides,         'lipides',   objE, bE)}`}>{e.lipides ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.sommeil,         'sommeil',   objE, bE)}`}>{e.sommeil ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.pas_journaliers, 'pas',       objE, bE)}`}>{e.pas_journaliers ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${metricColor(e.stress,          'stress',    objE, bE)}`}>{e.stress ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.poids ? `${e.poids}kg` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Graphe Kcal — continu, tous blocs confondus, toujours visible */}
      {loadingGlobal ? (
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      ) : globalKcalWeekly.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Kcal moyennes par semaine — historique complet</p>
          <p className="text-xs text-gray-300 mb-3">Continu entre les blocs</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={globalKcalWeekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="semaine" tick={{ fontSize: 11 }} />
              <YAxis  tick={{ fontSize: 11 }} width={40} domain={[ (dataMin) => Math.min(1500, dataMin), 'auto' ]} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="kcal" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Kcal" />
            </LineChart>
          </ResponsiveContainer>
          {blocsTimeline.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {blocsTimeline.map((b, i) => (
                <span key={b.id} className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 text-gray-500">
                  {b.name} · depuis {blocChipDate(b.startDate, i)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Graphe Poids — continu, tous blocs confondus, toujours visible */}
      {loadingGlobal ? (
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      ) : globalPoidsData.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Évolution du poids — historique complet</p>
          <p className="text-xs text-gray-300 mb-3">Continu entre les blocs</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={globalPoidsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} width={35} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [`${v} kg`]} />
              <Line type="monotone" dataKey="poids" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Poids" />
            </LineChart>
          </ResponsiveContainer>
          {blocsTimeline.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {blocsTimeline.map((b, i) => (
                <span key={b.id} className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 text-gray-500">
                  {b.name} · depuis {blocChipDate(b.startDate, i)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}