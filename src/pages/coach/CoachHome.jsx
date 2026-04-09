import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import WidgetConfig from '../../components/shared/WidgetConfig'
import { findActiveSemaine } from '../../lib/semaine'
import { metricColor, computeAverages } from '../../lib/tracking'

// ── ObjectifsBloc (coach perso) ──────────────────────────────────────────
const METRICS = [
  { key: 'seances_par_semaine', borneKey: 'seances', label: 'Séances / sem.',  unit: '',     type: 'number' },
  { key: 'kcal',                borneKey: 'kcal',    label: 'Kcal / jour',     unit: 'kcal', type: 'number' },
  { key: 'proteines',           borneKey: 'proteines',label: 'Protéines',      unit: 'g',    type: 'number' },
  { key: 'glucides',            borneKey: 'glucides', label: 'Glucides',       unit: 'g',    type: 'number' },
  { key: 'lipides',             borneKey: 'lipides',  label: 'Lipides',        unit: 'g',    type: 'number' },
  { key: 'sommeil',             borneKey: 'sommeil',  label: 'Sommeil',        unit: 'h',    type: 'number', step: '0.5' },
  { key: 'pas_journaliers',     borneKey: 'pas',      label: 'Pas / jour',     unit: '',     type: 'number' },
  { key: 'stress_cible',        borneKey: 'stress',   label: 'Stress cible',   unit: '/10',  type: 'number' },
]

function ObjectifsBloc({ bloc, onSave }) {
  const [obj, setObj]         = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})
  const [bornesForm, setBornesForm] = useState({})
  const [showBornes, setShowBornes] = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { if (bloc?.id) fetchObj() }, [bloc?.id])

  async function fetchObj() {
    const { data } = await supabase.from('objectifs_bloc').select('*').eq('bloc_id', bloc.id).single()
    setObj(data)
    if (data) { setForm(data); setBornesForm(data.bornes || {}) }
    else { setForm({}); setBornesForm({}) }
  }

  async function saveObj() {
    setSaving(true)
    const payload = { ...form, bloc_id: bloc.id, bornes: bornesForm }
    if (obj) await supabase.from('objectifs_bloc').update(payload).eq('id', obj.id)
    else      await supabase.from('objectifs_bloc').insert(payload)
    await fetchObj()
    if (onSave) onSave()
    setEditing(false)
    setSaving(false)
  }

  function setBorne(borneKey, side, value) {
    setBornesForm(b => ({
      ...b,
      [borneKey]: { ...(b[borneKey] || {}), [side]: value === '' ? undefined : Number(value) }
    }))
  }

  if (!bloc) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">Objectifs du bloc — {bloc.name}</h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={saveObj} disabled={saving} className="text-sm text-brand-600 font-medium hover:text-brand-800">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => { setEditing(false); setForm(obj || {}); setBornesForm(obj?.bornes || {}) }}
              className="text-sm text-gray-400">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm text-brand-600 hover:text-brand-800">Modifier</button>
        )}
      </div>

      {editing ? (
        <div className="space-y-5">
          {/* Plan nutritionnel */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Plan nutritionnel</label>
            <div className="flex gap-2 flex-wrap">
              {[['prise_de_masse','💪 Prise de masse'],['maintien','⚖️ Maintien'],['seche','🔥 Sèche']].map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => setForm(f => ({ ...f, plan_nutritionnel: val }))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${form.plan_nutritionnel === val ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cibles */}
          <div>
            <label className="text-xs text-gray-500 block mb-2">Cibles</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {METRICS.map(({ key, label, unit, type, step }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <div className="flex items-center gap-1 mt-0.5">
                    <input type={type} step={step} value={form[key] || ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    {unit && <span className="text-xs text-gray-400">{unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bornes */}
          <div>
            <button type="button" onClick={() => setShowBornes(v => !v)}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1">
              {showBornes ? '▾' : '▸'} Bornes de couleur personnalisées
            </button>
            <p className="text-xs text-gray-400 mt-0.5">Définit les plages vertes/oranges/rouges sur les graphiques.</p>
            {showBornes && (
              <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Métrique</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-center">Min</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-center">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(({ label, borneKey, unit }) => (
                      <tr key={borneKey} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-700">{label}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <input type="number" value={bornesForm[borneKey]?.min ?? ''}
                              onChange={e => setBorne(borneKey, 'min', e.target.value)} placeholder="—"
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 text-center" />
                            {unit && <span className="text-gray-400">{unit}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-center">
                            <input type="number" value={bornesForm[borneKey]?.max ?? ''}
                              onChange={e => setBorne(borneKey, 'max', e.target.value)} placeholder="—"
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 text-center" />
                            {unit && <span className="text-gray-400">{unit}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400">
                  ✓ Vert = dans la plage · ○ Orange = légèrement hors plage (±15%) · ✗ Rouge = hors plage
                </div>
              </div>
            )}
          </div>
        </div>
      ) : obj ? (
        <div className="space-y-3">
          {obj.plan_nutritionnel && (
            <div className="text-sm font-medium text-gray-800">
              {{'prise_de_masse':'💪 Prise de masse','maintien':'⚖️ Maintien','seche':'🔥 Sèche'}[obj.plan_nutritionnel]}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {METRICS.map(({ key, label, unit }) => (
              <div key={key}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm font-medium text-gray-900">
                  {obj[key] != null ? `${obj[key]}${unit ? ' ' + unit : ''}` : '—'}
                </p>
              </div>
            ))}
          </div>
          {obj.bornes && Object.keys(obj.bornes).length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Bornes : {Object.keys(obj.bornes).join(', ')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Aucun objectif défini. <button onClick={() => setEditing(true)} className="text-brand-600 hover:underline">Ajouter →</button></p>
      )}
    </div>
  )
}

export default function CoachHome() {
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const { isWidgetEnabled } = usePreferences()
  const [showConfig, setShowConfig] = useState(false)
  const [loading, setLoading]       = useState(true)

  // Athletes
  const [athletes, setAthletes]               = useState([])
  const [athleteTracking, setAthleteTracking] = useState({})
  const [athleteObjectifs, setAthleteObjectifs] = useState({})

  // Personal (self-profile)
  const [myNextSeance, setMyNextSeance]   = useState(null)
  const [mySuivi, setMySuivi]             = useState(null)
  const [myMacros, setMyMacros]           = useState(null)
  const [myObjectifs, setMyObjectifs]     = useState(null)
  const [activeBlocId, setActiveBlocId]   = useState(null)
  const [activeBloc, setActiveBloc]       = useState(null)

  // Séances de la semaine
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]             = useState([])

  // Saisie Repas IA
  const [repasInput, setRepasInput]         = useState('')
  const [repasJour, setRepasJour]           = useState([])
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [showFavoris, setShowFavoris]       = useState(false)
  const [favoris, setFavoris]               = useState([])
  const [totalMacros, setTotalMacros]       = useState({ kcal: 0, proteines: 0, glucides: 0, lipides: 0 })

  const today = new Date().toISOString().split('T')[0]

  const accentBtn  = theme?.isFemme ? 'bg-pink-600 hover:bg-pink-700 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'
  const accentText = theme?.isFemme ? 'text-pink-600' : 'text-brand-600'
  const accentBg   = theme?.isFemme ? 'bg-pink-600' : 'bg-brand-600'

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    setLoading(true)

    const { data: aths } = await supabase
      .from('profiles')
      .select('id, full_name, genre, is_self, blocs(id)')
      .eq('coach_id', profile.id)
      .order('is_self', { ascending: false })
      .order('full_name')
    setAthletes(aths || [])

    const athIds = (aths || []).map(a => a.id)
    if (!athIds.length) { setLoading(false); return }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

    const [trackingRes, blocsRes] = await Promise.all([
      supabase.from('data_tracking')
        .select('athlete_id, date, sport_fait, kcal, proteines, sommeil, pas_journaliers, stress')
        .in('athlete_id', athIds)
        .gte('date', sevenDaysAgoStr)
        .order('date'),
      supabase.from('blocs')
        .select('athlete_id, objectifs_bloc(*)')
        .in('athlete_id', athIds)
        .order('created_at', { ascending: false }),
    ])

    const trackingMap = {}
    for (const athId of athIds) {
      const entries = (trackingRes.data || []).filter(t => t.athlete_id === athId)
      if (!entries.length) { trackingMap[athId] = null; continue }
      const avgs = computeAverages(entries, ['kcal', 'proteines', 'sommeil', 'stress', 'pas'])
      trackingMap[athId] = {
        avgs,
        sportJours: entries.filter(e => e.sport_fait).length,
        lastDate:   entries[entries.length - 1]?.date,
        nbJours:    entries.length,
      }
    }
    setAthleteTracking(trackingMap)

    const objMap = {}
    const seen   = new Set()
    for (const bloc of (blocsRes.data || [])) {
      if (!seen.has(bloc.athlete_id)) {
        seen.add(bloc.athlete_id)
        objMap[bloc.athlete_id] = Array.isArray(bloc.objectifs_bloc)
          ? bloc.objectifs_bloc[0]
          : bloc.objectifs_bloc
      }
    }
    setAthleteObjectifs(objMap)

    await fetchPersonalData(profile.id)
    setLoading(false)
  }

  async function fetchPersonalData(athleteId) {
    const { data: blocs } = await supabase
      .from('blocs').select('id, name, objectifs_bloc(*)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false }).limit(1)
    if (!blocs?.length) return

    const bloc = blocs[0]
    setActiveBlocId(bloc.id)
    setActiveBloc(bloc)
    const obj  = Array.isArray(bloc.objectifs_bloc) ? bloc.objectifs_bloc[0] : bloc.objectifs_bloc
    setMyObjectifs(obj)

    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').eq('bloc_id', bloc.id).order('numero')
    if (semaines?.length) {
      const activeSem = await findActiveSemaine(semaines, athleteId)
      setActiveSemaine(activeSem)

      const { data: sc } = await supabase
        .from('seances')
        .select('id, nom, ordre, exercices(id, series_realisees(id))')
        .eq('semaine_id', activeSem.id).order('ordre')

      setSeances(sc || [])

      const seancesNormales = (sc || []).filter(s => s.nom !== 'Bonus' && (s.exercices?.length || 0) > 0)
      const pasCommencee    = seancesNormales.find(s =>
        s.exercices.filter(e => (e.series_realisees?.length || 0) > 0).length === 0
      )
      const enCours = seancesNormales.find(s => {
        const done = s.exercices.filter(e => (e.series_realisees?.length || 0) > 0).length
        return done > 0 && done < s.exercices.length
      })
      const next = pasCommencee || enCours
      if (next) setMyNextSeance({ seance: next, semaineId: activeSem.id })
    }

    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: tracking } = await supabase
      .from('data_tracking').select('*')
      .eq('athlete_id', athleteId).eq('bloc_id', bloc.id)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false }).limit(7)
    if (tracking?.length) {
      const avgs = computeAverages(tracking, ['kcal', 'proteines', 'glucides', 'lipides', 'sommeil', 'pas', 'stress'])
      setMySuivi({ avgs, sportJours: tracking.filter(d => d.sport_fait).length, nbJours: tracking.length })
    }

    await fetchRepasJour(athleteId)
    await fetchFavoris(athleteId)
  }

  // --- Fonctions Saisie Repas IA ---
  async function fetchRepasJour(athleteId = profile.id) {
    const { data } = await supabase.from('repas').select('*')
      .eq('athlete_id', athleteId).eq('date', today).order('created_at')
    const list = data || []
    setRepasJour(list)
    recalcTotals(list)
  }

  function recalcTotals(list) {
    const totals = list.reduce((acc, r) => ({
      kcal:      acc.kcal      + (Number(r.kcal)      || 0),
      proteines: acc.proteines + (Number(r.proteines) || 0),
      glucides:  acc.glucides  + (Number(r.glucides)  || 0),
      lipides:   acc.lipides   + (Number(r.lipides)   || 0),
    }), { kcal: 0, proteines: 0, glucides: 0, lipides: 0 })
    setTotalMacros(totals)
    setMyMacros(totals)
    return totals
  }

  async function fetchFavoris(athleteId = profile.id) {
    const { data } = await supabase.from('repas_favoris').select('*')
      .eq('athlete_id', athleteId).order('nom')
    setFavoris(data || [])
  }

  // ✅ FIX : passe par /api/analyze-repas comme AthleteHome
  async function analyzeRepas() {
    if (!repasInput.trim()) return
    setAnalyzeLoading(true)
    try {
      const response = await fetch('/api/analyze-repas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal: repasInput })
      })
      if (!response.ok) throw new Error('Erreur serveur')
      const macros = await response.json()

      await supabase.from('repas').insert({
        athlete_id: profile.id, date: today, description: repasInput.trim(),
        kcal: Math.round(macros.kcal || 0),
        proteines: Math.round((macros.proteines || 0) * 10) / 10,
        glucides:  Math.round((macros.glucides  || 0) * 10) / 10,
        lipides:   Math.round((macros.lipides   || 0) * 10) / 10,
      })
      setRepasInput('')

      const { data: allRepas } = await supabase.from('repas').select('*')
        .eq('athlete_id', profile.id).eq('date', today).order('created_at')
      const list = allRepas || []
      setRepasJour(list)
      const newTotals = recalcTotals(list)

      if (activeBlocId) {
        await supabase.from('data_tracking').upsert({
          athlete_id: profile.id, date: today, bloc_id: activeBlocId,
          kcal:      Math.round(newTotals.kcal),
          proteines: Math.round(newTotals.proteines * 10) / 10,
          glucides:  Math.round(newTotals.glucides  * 10) / 10,
          lipides:   Math.round(newTotals.lipides   * 10) / 10,
        }, { onConflict: 'athlete_id,date' })
      }
    } catch (e) { console.error('analyzeRepas:', e) }
    setAnalyzeLoading(false)
  }

  async function addFavori(f) {
    await supabase.from('repas').insert({ athlete_id: profile.id, date: today, description: f.description, kcal: f.kcal, proteines: f.proteines, glucides: f.glucides, lipides: f.lipides })
    await fetchRepasJour(); setShowFavoris(false)
  }
  async function saveAsFavori(repas) {
    const nom = window.prompt('Nom ?', repas.description.slice(0, 40))
    if (!nom) return
    await supabase.from('repas_favoris').insert({ athlete_id: profile.id, nom, description: repas.description, kcal: repas.kcal, proteines: repas.proteines, glucides: repas.glucides, lipides: repas.lipides })
    await fetchFavoris()
  }
  async function deleteRepas(id) { await supabase.from('repas').delete().eq('id', id); await fetchRepasJour() }
  async function deleteFavori(id) { await supabase.from('repas_favoris').delete().eq('id', id); await fetchFavoris() }

  function relativeDate(dateStr) {
    if (!dateStr) return 'jamais'
    const diff = Math.floor((new Date() - new Date(dateStr + 'T12:00:00')) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const bornes     = myObjectifs?.bornes || {}

  const SUIVI_METRICS = [
    { key: 'kcal',      label: 'Kcal',    unit: '',    isInt: true  },
    { key: 'proteines', label: 'Prot.',   unit: 'g',   isInt: true  },
    { key: 'lipides',   label: 'Lip.',    unit: 'g',   isInt: true  },
    { key: 'glucides',  label: 'Gluc.',   unit: 'g',   isInt: true  },
    { key: 'sommeil',   label: 'Sommeil', unit: 'h',   isInt: false },
    { key: 'pas',       label: 'Pas',     unit: '',    isInt: true  },
    { key: 'stress',    label: 'Stress',  unit: '/10', isInt: false },
  ]

  return (
    <Layout>
      {showConfig && <WidgetConfig onClose={() => setShowConfig(false)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
          <h1 className="text-xl font-semibold">Bonjour {profile?.full_name?.split(' ')[0]}</h1>
        </div>
        <button onClick={() => setShowConfig(true)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5">
          Widgets
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">

          {/* 1. ── Prochaine séance ── */}
          {isWidgetEnabled('next_seance') && (
            myNextSeance ? (
              <div className={`${accentBg} text-white rounded-2xl p-4`}>
                <p className="text-xs font-medium opacity-70 mb-0.5">Ma prochaine séance</p>
                <p className="text-base font-semibold mb-2">{myNextSeance.seance.nom}</p>
                <button
                  onClick={() => navigate(`/coach/my-training/seance/${myNextSeance.seance.id}/semaine/${myNextSeance.semaineId}`)}
                  className={`bg-white px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-90 ${accentText}`}>
                  Commencer
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">Aucune séance programmée</p>
                <Link to="/coach/mon-programme" className={`text-xs font-medium ${accentText}`}>Créer un programme →</Link>
              </div>
            )
          )}

          {/* 2. ── Liste coachés avec tracking ── */}
          {isWidgetEnabled('liste_coachés') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Mes coachés</p>
                <Link to="/coach/athletes" className={`text-xs font-medium ${accentText}`}>Voir tout →</Link>
              </div>
              {athletes.filter(a => !a.is_self).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aucun coaché pour l'instant.</p>
              ) : athletes.filter(a => !a.is_self).map(a => {
                const tr  = athleteTracking[a.id]
                const obj = athleteObjectifs[a.id]
                const b   = obj?.bornes || {}
                return (
                  <Link key={a.id} to={`/coach/athlete/${a.id}`}
                    className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between hover:border-brand-200 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${a.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                        {initiales(a.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700 truncate">{a.full_name}</p>
                        {tr ? (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-xs ${metricColor(tr.sportJours, 'seances', obj, b) || 'text-gray-500'}`}>
                              {tr.sportJours}j sport
                            </span>
                            {tr.avgs.kcal != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.kcal, 'kcal', obj, b) || 'text-gray-500'}`}>
                                {Math.round(tr.avgs.kcal)} kcal
                              </span>
                            )}
                            {tr.avgs.proteines != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.proteines, 'proteines', obj, b) || 'text-gray-500'}`}>
                                P{Math.round(tr.avgs.proteines)}g
                              </span>
                            )}
                            {tr.avgs.sommeil != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.sommeil, 'sommeil', obj, b) || 'text-gray-500'}`}>
                                {parseFloat(tr.avgs.sommeil).toFixed(1)}h
                              </span>
                            )}
                            {tr.avgs.stress != null && (
                              <span className={`text-xs ${metricColor(tr.avgs.stress, 'stress', obj, b) || 'text-gray-500'}`}>
                                stress {parseFloat(tr.avgs.stress).toFixed(1)}
                              </span>
                            )}
                            <span className="text-xs text-gray-300">{relativeDate(tr.lastDate)}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">Aucune donnée récente</p>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm ml-2 flex-shrink-0">›</span>
                  </Link>
                )
              })}
            </div>
          )}

          {/* 3. ── Objectifs perso ── */}
          {isWidgetEnabled('suivi_perso') && activeBloc && (
            <ObjectifsBloc bloc={activeBloc} onSave={() => fetchPersonalData(profile.id)} />
          )}

          {/* 4. ── Mon suivi 7j ── */}
          {isWidgetEnabled('suivi_perso') && (
            mySuivi ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">Mon suivi — 7 derniers jours</p>
                  <Link to="/coach/tracking" className={`text-xs font-medium ${accentText}`}>Remplir →</Link>
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8">
                  <div className="flex flex-col items-center">
                    <span className={`text-sm font-semibold ${metricColor(mySuivi.sportJours, 'seances', myObjectifs, bornes) || 'text-gray-800'}`}>
                      {mySuivi.sportJours}j
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5">Sport</span>
                  </div>
                  {SUIVI_METRICS.map(({ key, label, unit, isInt }) => {
                    const val = mySuivi.avgs[key]
                    if (val == null) return null
                    const color     = metricColor(val, key, myObjectifs, bornes)
                    const displayed = key === 'pas'
                      ? Math.round(val).toLocaleString('fr')
                      : isInt ? Math.round(val) : parseFloat(val).toFixed(1)
                    return (
                      <div key={key} className="flex flex-col items-center">
                        <span className={`text-sm font-semibold tabular-nums ${color || 'text-gray-800'}`}>{displayed}{unit}</span>
                        <span className="text-xs text-gray-400 mt-0.5 truncate">{label}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-300 mt-2 text-right">moyennes sur {mySuivi.nbJours} entrée{mySuivi.nbJours > 1 ? 's' : ''}</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">Aucune donnée de suivi ces 7 derniers jours</p>
                <Link to="/coach/tracking" className={`text-xs font-medium ${accentText}`}>Remplir →</Link>
              </div>
            )
          )}

          {/* 5. ── Saisie repas IA ── */}
          {isWidgetEnabled('saisie_repas') && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Ajouter un repas</p>
                <button onClick={() => setShowFavoris(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${showFavoris ? 'border-gray-300 text-gray-700 bg-gray-50' : 'border-gray-200 text-gray-500'}`}>
                  Mes repas
                </button>
              </div>
              {showFavoris && (
                <div className="mb-3 space-y-1 max-h-40 overflow-y-auto">
                  {favoris.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-2">Aucun repas enregistré.</p>
                    : favoris.map(f => (
                      <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{f.nom}</p>
                          <p className="text-xs text-gray-400">{f.kcal} kcal</p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button onClick={() => addFavori(f)} className={`text-xs px-2 py-1 rounded-lg ${accentBtn}`}>Ajouter</button>
                          <button onClick={() => deleteFavori(f.id)} className="text-xs text-gray-300 hover:text-red-400 px-1">×</button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={repasInput} onChange={e => setRepasInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && analyzeRepas()}
                  placeholder="Ex: 2 oeufs, 80g flocons, 200ml lait…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button onClick={analyzeRepas} disabled={analyzeLoading || !repasInput.trim()}
                  className={`${accentBtn} px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex-shrink-0`}>
                  {analyzeLoading ? '…' : 'OK'}
                </button>
              </div>
              {repasJour.length > 0 && (
                <div className="mt-2 space-y-1">
                  {repasJour.map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{r.description}</p>
                        <p className={`text-xs font-medium mt-0.5 ${accentText}`}>{r.kcal} kcal · P{Math.round(r.proteines)}g L{Math.round(r.lipides)}g G{Math.round(r.glucides)}g</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => saveAsFavori(r)} className="text-xs text-gray-300 hover:text-amber-400">★</button>
                        <button onClick={() => deleteRepas(r.id)} className="text-xs text-gray-300 hover:text-red-400">×</button>
                      </div>
                    </div>
                  ))}
                  <div className={`flex justify-between px-3 py-1.5 rounded-lg text-xs font-medium ${theme?.isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700'}`}>
                    <span>Total</span>
                    <span>{Math.round(totalMacros.kcal)} kcal · P{Math.round(totalMacros.proteines)}g L{Math.round(totalMacros.lipides)}g G{Math.round(totalMacros.glucides)}g</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. ── Mes macros du jour ── */}
          {isWidgetEnabled('macros_jour') && (
            myMacros ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">Mes macros du jour</p>
                  <Link to="/coach/tracking" className={`text-xs font-medium ${accentText}`}>Suivi complet →</Link>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ['Kcal',  myMacros.kcal,      myObjectifs?.kcal,      '' ],
                    ['Prot.', myMacros.proteines, myObjectifs?.proteines, 'g'],
                    ['Lip.',  myMacros.lipides,   myObjectifs?.lipides,   'g'],
                    ['Gluc.', myMacros.glucides,  myObjectifs?.glucides,  'g'],
                  ].map(([label, val, target, unit]) => {
                    const pct = target && val ? Math.min(100, Math.round((val / target) * 100)) : 0
                    return (
                      <div key={label}>
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <p className="text-sm font-semibold text-gray-900">{Math.round(val || 0)}{unit}</p>
                        {target && (
                          <>
                            <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                              <div className={`h-full rounded-full ${accentBg}`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">/ {target}{unit}</p>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">Aucun repas renseigné aujourd'hui</p>
                <Link to="/coach/tracking" className={`text-xs font-medium ${accentText}`}>Remplir →</Link>
              </div>
            )
          )}

          {/* 7. ── Séances de la semaine ── */}
          {isWidgetEnabled('semaine_seances') && seances.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Semaine {activeSemaine?.numero}</p>
                <Link to="/coach/mon-programme" className={`text-xs font-medium ${accentText}`}>Voir tout</Link>
              </div>
              <div className="space-y-1">
                {seances.filter(s => s.nom !== 'Bonus').map(sc => {
                  const total    = sc.exercices?.length || 0
                  const done     = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
                  const complete = done >= total && total > 0
                  return (
                    <Link key={sc.id} to={`/coach/my-training/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${complete ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                      <span className={`text-sm ${complete ? 'text-green-700' : 'text-gray-700'}`}>{sc.nom}</span>
                      <span className={`text-xs ${complete ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                        {complete ? 'Terminé' : `${done}/${total}`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
