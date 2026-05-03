import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import WidgetConfig from '../../components/shared/WidgetConfig'
import { findActiveSemaine } from '../../lib/semaine'
import { metricColor, computeAverages } from '../../lib/tracking'
import { calcTDEE } from '../../lib/tdee'
import CycleWidget from '../../components/athlete/CycleWidget'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function MacroAdjustPanel({ initial, description, onConfirm, onCancel, accentBtn }) {
  const [form, setForm] = useState({
    kcal:      initial.kcal      ?? '',
    proteines: initial.proteines ?? '',
    glucides:  initial.glucides  ?? '',
    lipides:   initial.lipides   ?? '',
  })
  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-medium text-gray-600 truncate">{description}</p>
      <div className="grid grid-cols-2 gap-2">
        {[['kcal','Kcal',''],['proteines','Prot.','g'],['glucides','Gluc.','g'],['lipides','Lip.','g']].map(([key, label, unit]) => (
          <div key={key} className="flex items-center gap-1">
            <label className="text-xs text-gray-400 w-10 flex-shrink-0">{label}</label>
            <input type="number" value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            {unit && <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onConfirm({
          kcal:      Math.round(Number(form.kcal)      || 0),
          proteines: Math.round((Number(form.proteines) || 0) * 10) / 10,
          glucides:  Math.round((Number(form.glucides)  || 0) * 10) / 10,
          lipides:   Math.round((Number(form.lipides)   || 0) * 10) / 10,
        })} className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${accentBtn}`}>
          ✓ Valider
        </button>
        <button onClick={onCancel} className="flex-1 border border-gray-200 rounded-lg py-1.5 text-sm text-gray-500">
          Annuler
        </button>
      </div>
    </div>
  )
}

export default function AthleteHome() {
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const { isWidgetEnabled } = usePreferences()
  const [showConfig, setShowConfig]         = useState(false)
  const photoInputRef                       = useRef(null)

  const [nextSeance, setNextSeance]         = useState(null)
  const [objectifs, setObjectifs]           = useState(null)
  const [activeSemaine, setActiveSemaine]   = useState(null)
  const [seances, setSeances]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [loadingTdee, setLoadingTdee]       = useState(false)
  const [activeBlocId, setActiveBlocId]     = useState(null)

  const [repasInput, setRepasInput]         = useState('')
  const [repasJour, setRepasJour]           = useState([])
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [photoLoading, setPhotoLoading]     = useState(false)
  const [showFavoris, setShowFavoris]       = useState(false)
  const [favoris, setFavoris]               = useState([])
  const [totalMacros, setTotalMacros]       = useState({ kcal: 0, proteines: 0, glucides: 0, lipides: 0 })
  const [suiviSemaine, setSuiviSemaine]     = useState(null)
  const [tdeeData, setTdeeData]             = useState(null)
  const [pendingMacros, setPendingMacros]   = useState(null)

  const today      = new Date().toISOString().split('T')[0]
  const accentBtn  = theme.isFemme ? 'bg-pink-600 hover:bg-pink-700 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'
  const accentText = theme.isFemme ? 'text-pink-600' : 'text-brand-600'
  const accentBg   = theme.isFemme ? 'bg-pink-600' : 'bg-brand-600'
  const bornes     = objectifs?.bornes || {}

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    const { data: blocs } = await supabase
      .from('blocs').select('id, name, objectifs_bloc(*)')
      .eq('athlete_id', profile.id).order('created_at', { ascending: false }).limit(1)

    if (blocs?.[0]) {
      setActiveBlocId(blocs[0].id)
      const obj = Array.isArray(blocs[0].objectifs_bloc) ? blocs[0].objectifs_bloc[0] : blocs[0].objectifs_bloc
      setObjectifs(obj)
      fetchSemaines(blocs[0].id)
      fetchSuiviSemaine(blocs[0].id)
      fetchTdee(blocs[0].id)
    } else {
      setLoading(false)
    }

    fetchRepasJour()
    fetchFavoris()
  }

  async function fetchSemaines(blocId) {
    const { data: semaines } = await supabase
      .from('semaines').select('id, numero').eq('bloc_id', blocId).order('numero')
    if (!semaines?.length) { setLoading(false); return }

    const activeSem = await findActiveSemaine(semaines, profile.id)
    setActiveSemaine(activeSem)

    const { data: sc } = await supabase
      .from('seances')
      .select('id, nom, ordre, exercices(id, series_realisees(id))')
      .eq('semaine_id', activeSem.id).order('ordre')
    setSeances(sc || [])

    const seancesNormales = (sc || []).filter(s => s.nom !== 'Bonus' && (s.exercices?.length || 0) > 0)
    const pasCommencee = seancesNormales.find(s =>
      s.exercices.filter(e => (e.series_realisees?.length || 0) > 0).length === 0
    )
    const enCours = seancesNormales.find(s => {
      const done = s.exercices.filter(e => (e.series_realisees?.length || 0) > 0).length
      return done > 0 && done < s.exercices.length
    })
    if (pasCommencee || enCours) setNextSeance({ seance: pasCommencee || enCours, semaineId: activeSem.id })
    setLoading(false)
  }

  async function fetchSuiviSemaine(blocId) {
    const { data } = await supabase.from('data_tracking').select('*')
      .eq('athlete_id', profile.id).eq('bloc_id', blocId)
      .order('date', { ascending: false }).limit(7)
    if (!data?.length) return
    const avgs = computeAverages(data, ['kcal', 'proteines', 'glucides', 'lipides', 'sommeil', 'pas', 'stress'])
    setSuiviSemaine({ avgs, sportJours: data.filter(d => d.sport_fait).length, nbJours: data.length })
  }

  /**
   * Calcule le TDEE de l'athlète connecté.
   * Sources par priorité :
   *   Poids    : data_tracking > profile.poids (onboarding)
   *   Activité : data_tracking 30j (≥7 entrées) > objectifs_bloc > profile (onboarding)
   *   travail_physique : profile.travail_physique
   */
  async function fetchTdee(blocId) {
    if (!profile?.taille || !profile?.date_naissance) return
    setLoadingTdee(true)

    // 1. Poids
    const { data: poidsData } = await supabase
      .from('data_tracking').select('poids, date')
      .eq('athlete_id', profile.id).not('poids', 'is', null)
      .order('date', { ascending: false }).limit(1)

    const poids = poidsData?.[0]?.poids || profile.poids
    if (!poids) { setLoadingTdee(false); return }

    // 2. Activité sur 30 jours
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const { data: tracking } = await supabase
      .from('data_tracking').select('pas_journaliers, sport_fait, date')
      .eq('athlete_id', profile.id)
      .gte('date', thirtyAgo.toISOString().split('T')[0]).order('date')

    const entries           = tracking || []
    const pasVals           = entries.map(e => e.pas_journaliers).filter(v => v != null)
    const pasJournaliersMoy = pasVals.length
      ? pasVals.reduce((a, b) => a + b, 0) / pasVals.length : 0
    const seancesTracking   = entries.filter(e => e.sport_fait).length / Math.max(1, entries.length / 7)

    // 3. Fallback objectifs_bloc
    const { data: objBloc } = await supabase
      .from('objectifs_bloc').select('pas_journaliers, seances_par_semaine')
      .eq('bloc_id', blocId).single()

    const hasSufficientTracking = entries.length >= 7
    const pasUsed      = hasSufficientTracking ? pasJournaliersMoy      : (objBloc?.pas_journaliers     || profile.pas_journaliers_moy || 0)
    const seancesUsed  = hasSufficientTracking ? seancesTracking        : (objBloc?.seances_par_semaine || profile.seances_semaine     || 0)

    const result = calcTDEE(
      {
        poids,
        taille:           profile.taille,
        date_naissance:   profile.date_naissance,
        genre:            profile.genre,
        travail_physique: profile.travail_physique || false,
      },
      { pasJournaliersMoy: pasUsed, seancesParSemaine: seancesUsed }
    )

    if (result) {
      setTdeeData({
        ...result,
        poids,
        pasJournaliersMoy:  Math.round(pasUsed),
        seancesParSemaine:  parseFloat(seancesUsed.toFixed(1)),
        lastPoidsDate:      poidsData?.[0]?.date || 'Onboarding',
        sourceActivite:     hasSufficientTracking ? 'tracking' : 'onboarding',
      })
    }
    setLoadingTdee(false)
  }

  async function fetchRepasJour() {
    const { data } = await supabase.from('repas').select('*')
      .eq('athlete_id', profile.id).eq('date', today).order('created_at')
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
    return totals
  }

  async function fetchFavoris() {
    const { data } = await supabase.from('repas_favoris').select('*')
      .eq('athlete_id', profile.id).order('nom')
    setFavoris(data || [])
  }

  async function analyzeRepas() {
    if (!repasInput.trim()) return
    setAnalyzeLoading(true)
    try {
      const response = await fetch('/api/analyze-repas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal: repasInput })
      })
      if (!response.ok) throw new Error('Erreur serveur')
      const macros = await response.json()
      setPendingMacros({ source: 'text', data: macros, description: repasInput.trim() })
    } catch (e) { console.error('analyzeRepas:', e) }
    setAnalyzeLoading(false)
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    setPhotoLoading(true)
    try {
      const base64 = await fileToBase64(file)
      const response = await fetch('/api/analyze-repas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal: '', image: { mimeType: file.type || 'image/jpeg', data: base64 } })
      })
      if (!response.ok) throw new Error('Erreur serveur')
      const macros = await response.json()
      setPendingMacros({ source: 'photo', data: macros, description: '📷 Photo étiquette' })
    } catch (e) { console.error('handlePhoto:', e) }
    e.target.value = ''
    setPhotoLoading(false)
  }

  function addFavoriWithAdjust(f) {
    setPendingMacros({
      source: 'favori',
      data: { kcal: f.kcal, proteines: f.proteines, glucides: f.glucides, lipides: f.lipides },
      description: f.description || f.nom,
      favori: f,
    })
    setShowFavoris(false)
  }

  async function confirmMacros(adjustedMacros) {
    if (!pendingMacros) return
    const description = pendingMacros.source === 'favori'
      ? (pendingMacros.favori.description || pendingMacros.favori.nom)
      : pendingMacros.description

    await supabase.from('repas').insert({
      athlete_id: profile.id, date: today, description,
      kcal: adjustedMacros.kcal, proteines: adjustedMacros.proteines,
      glucides: adjustedMacros.glucides, lipides: adjustedMacros.lipides,
    })

    if (pendingMacros.source === 'text') setRepasInput('')
    setPendingMacros(null)

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
  }

  async function saveAsFavori(repas) {
    const nom = window.prompt('Nom ?', repas.description.slice(0, 40))
    if (!nom) return
    await supabase.from('repas_favoris').insert({
      athlete_id: profile.id, nom, description: repas.description,
      kcal: repas.kcal, proteines: repas.proteines, glucides: repas.glucides, lipides: repas.lipides,
    })
    await fetchFavoris()
  }

  async function deleteRepas(id) { await supabase.from('repas').delete().eq('id', id); await fetchRepasJour() }
  async function deleteFavori(id) { await supabase.from('repas_favoris').delete().eq('id', id); await fetchFavoris() }

  const MacroBar = ({ label, val, target, color }) => {
    const pct = target && val ? Math.min(100, Math.round((val / target) * 100)) : 0
    return (
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500">{label}</span>
          <span className="text-gray-700 font-medium">
            {Math.round(val || 0)}{label === 'Kcal' ? '' : 'g'} / {target || '—'}{target && label !== 'Kcal' ? 'g' : ''}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  const SuiviVal = ({ label, value, bilanKey, unit = '', isInt = true }) => {
    if (value == null) return null
    const displayed = isInt
      ? (bilanKey === 'pas' ? Math.round(value).toLocaleString('fr') : Math.round(value))
      : parseFloat(value).toFixed(1)
    const color = metricColor(value, bilanKey, objectifs, bornes)
    return (
      <div className="flex flex-col items-center min-w-0">
        <span className={`text-sm font-semibold tabular-nums ${color || 'text-gray-800'}`}>{displayed}{unit}</span>
        <span className="text-xs text-gray-400 mt-0.5 truncate">{label}</span>
      </div>
    )
  }

  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Layout>
      {showConfig && <WidgetConfig onClose={() => setShowConfig(false)} />}

      <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handlePhoto} />

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
          <h1 className="text-xl font-semibold text-gray-900">Bonjour {profile?.full_name?.split(' ')[0]}</h1>
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

          {/* Prochaine séance */}
          {isWidgetEnabled('next_seance') && nextSeance && (
            <div className={`${accentBg} text-white rounded-2xl p-4`}>
              <p className="text-xs font-medium opacity-70 mb-0.5">Prochaine séance</p>
              <p className="text-base font-semibold mb-2">{nextSeance.seance.nom}</p>
              <button onClick={() => navigate(`/athlete/seance/${nextSeance.seance.id}/semaine/${nextSeance.semaineId}`)}
                className="bg-white px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-90"
                style={{ color: theme.isFemme ? '#db2777' : '#4f46e5' }}>
                Commencer
              </button>
            </div>
          )}

          {/* Widget cycle — femmes uniquement */}
          {theme.isFemme && <CycleWidget />}

          {/* Suivi 7 derniers jours */}
          {isWidgetEnabled('suivi_bloc') && suiviSemaine && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Suivi — 7 derniers jours</p>
                <Link to="/athlete/tracking" className={`text-xs ${accentText} font-medium`}>Détail →</Link>
              </div>
              <div className="grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8">
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-semibold ${metricColor(suiviSemaine.sportJours, 'seances', objectifs, bornes) || 'text-gray-800'}`}>
                    {suiviSemaine.sportJours}j
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">Sport</span>
                </div>
                <SuiviVal label="Kcal"    value={suiviSemaine.avgs.kcal}      bilanKey="kcal"      />
                <SuiviVal label="Prot."   value={suiviSemaine.avgs.proteines}  bilanKey="proteines" unit="g" />
                <SuiviVal label="Gluc."   value={suiviSemaine.avgs.glucides}   bilanKey="glucides"  unit="g" />
                <SuiviVal label="Lip."    value={suiviSemaine.avgs.lipides}    bilanKey="lipides"   unit="g" />
                <SuiviVal label="Sommeil" value={suiviSemaine.avgs.sommeil}    bilanKey="sommeil"   unit="h" isInt={false} />
                <SuiviVal label="Pas"     value={suiviSemaine.avgs.pas}        bilanKey="pas"       />
                <SuiviVal label="Stress"  value={suiviSemaine.avgs.stress}     bilanKey="stress"    unit="/10" isInt={false} />
              </div>
              <p className="text-xs text-gray-300 mt-2 text-right">
                moyennes sur {suiviSemaine.nbJours} entrée{suiviSemaine.nbJours > 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Maintien calorique estimé (TDEE) */}
          {isWidgetEnabled('suivi_bloc') && (
            loadingTdee ? (
              <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ) : tdeeData ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Mon maintien estimé</p>
                  <Link to="/athlete/tracking" className={`text-xs ${accentText} font-medium`}>Mon suivi →</Link>
                </div>
                <p className={`text-2xl font-bold ${accentText}`}>{tdeeData.tdee} <span className="text-sm font-normal text-gray-500">kcal/jour</span></p>
                <p className="text-xs text-gray-400 mt-1">
                  BMR {tdeeData.bmr} kcal · ×{tdeeData.multiplier} · {tdeeData.activityLabel}
                </p>
                <p className="text-xs text-gray-300 mt-0.5">
                  {tdeeData.poids}kg · {tdeeData.pasJournaliersMoy.toLocaleString('fr')} pas/j · {tdeeData.seancesParSemaine} séances/sem
                  {tdeeData.sourceActivite === 'onboarding' ? ' · données onboarding' : ' · 30j tracking'}
                </p>
                {objectifs?.kcal && (
                  <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${theme.isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700'}`}>
                    <span>🎯</span>
                    <span>
                      Objectif coach : <strong>{objectifs.kcal} kcal/j</strong>
                      {objectifs.plan_nutritionnel && (
                        <span className="ml-1 text-gray-500">
                          ({{'prise_de_masse': 'prise de masse', 'maintien': 'maintien', 'seche': 'sèche'}[objectifs.plan_nutritionnel]})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            ) : (!profile?.taille || !profile?.date_naissance) ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-500 mb-1">Maintien calorique non disponible</p>
                <p className="text-xs text-gray-400">Ton coach doit compléter ta taille et date de naissance.</p>
              </div>
            ) : null
          )}

          {/* Saisie repas */}
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
                          <button onClick={() => addFavoriWithAdjust(f)} className={`text-xs px-2 py-1 rounded-lg ${accentBtn}`}>Ajouter</button>
                          <button onClick={() => deleteFavori(f.id)} className="text-xs text-gray-300 hover:text-red-400 px-1">×</button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {pendingMacros?.source === 'favori' && (
                <MacroAdjustPanel initial={pendingMacros.data} description={pendingMacros.description}
                  onConfirm={confirmMacros} onCancel={() => setPendingMacros(null)} accentBtn={accentBtn} />
              )}

              <div className="flex gap-2">
                <input value={repasInput} onChange={e => setRepasInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !pendingMacros && analyzeRepas()}
                  placeholder="Ex: 2 oeufs, 80g flocons, 200ml lait…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button onClick={() => photoInputRef.current?.click()} disabled={photoLoading}
                  title="Scanner une étiquette"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-lg hover:border-gray-300 disabled:opacity-50 flex-shrink-0">
                  {photoLoading ? '…' : '📷'}
                </button>
                <button onClick={analyzeRepas} disabled={analyzeLoading || !repasInput.trim()}
                  className={`${accentBtn} px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex-shrink-0`}>
                  {analyzeLoading ? '…' : 'OK'}
                </button>
              </div>

              {(pendingMacros?.source === 'text' || pendingMacros?.source === 'photo') && (
                <MacroAdjustPanel initial={pendingMacros.data} description={pendingMacros.description}
                  onConfirm={confirmMacros} onCancel={() => setPendingMacros(null)} accentBtn={accentBtn} />
              )}

              {repasJour.length > 0 && (
                <div className="mt-2 space-y-1">
                  {repasJour.map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{r.description}</p>
                        <p className={`text-xs font-medium mt-0.5 ${accentText}`}>
                          {r.kcal} kcal · P{Math.round(r.proteines)}g G{Math.round(r.glucides)}g L{Math.round(r.lipides)}g
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => saveAsFavori(r)} className="text-xs text-gray-300 hover:text-amber-400">★</button>
                        <button onClick={() => deleteRepas(r.id)} className="text-xs text-gray-300 hover:text-red-400">×</button>
                      </div>
                    </div>
                  ))}
                  <div className={`flex justify-between px-3 py-1.5 rounded-lg text-xs font-medium ${theme.isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700'}`}>
                    <span>Total</span>
                    <span>{Math.round(totalMacros.kcal)} kcal · P{Math.round(totalMacros.proteines)}g G{Math.round(totalMacros.glucides)}g L{Math.round(totalMacros.lipides)}g</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Objectifs nutritionnels */}
          {isWidgetEnabled('macros_jour') && objectifs && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Objectifs nutritionnels</p>
                <Link to="/athlete/tracking" className={`text-xs ${accentText} font-medium`}>Suivi complet</Link>
              </div>
              <div className="space-y-2.5">
                <MacroBar label="Kcal"      val={totalMacros.kcal}      target={objectifs.kcal}      color={theme.isFemme ? 'bg-pink-500' : 'bg-brand-500'} />
                <MacroBar label="Protéines" val={totalMacros.proteines} target={objectifs.proteines} color={theme.isFemme ? 'bg-pink-400' : 'bg-brand-400'} />
                <MacroBar label="Glucides"  val={totalMacros.glucides}  target={objectifs.glucides}  color="bg-green-500" />
                <MacroBar label="Lipides"   val={totalMacros.lipides}   target={objectifs.lipides}   color="bg-orange-400" />
              </div>
            </div>
          )}

          {/* Séances de la semaine */}
          {isWidgetEnabled('semaine_seances') && seances.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Semaine {activeSemaine?.numero}</p>
                <Link to="/athlete/entrainement" className={`text-xs ${accentText} font-medium`}>Voir tout</Link>
              </div>
              <div className="space-y-1">
                {seances.filter(s => s.nom !== 'Bonus').map(sc => {
                  const total    = sc.exercices?.length || 0
                  const done     = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
                  const complete = done >= total && total > 0
                  return (
                    <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
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
