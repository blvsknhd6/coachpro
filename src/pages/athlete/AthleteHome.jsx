import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { usePreferences } from '../../hooks/usePreferences'
import Layout from '../../components/shared/Layout'
import WidgetConfig from '../../components/shared/WidgetConfig'
import { findActiveSemaine } from '../../lib/semaine'

export default function AthleteHome() {
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const { isWidgetEnabled, prefs } = usePreferences()
  const [showConfig, setShowConfig] = useState(false)

  const [nextSeance, setNextSeance]     = useState(null)
  const [streak, setStreak]             = useState(0)
  const [objectifs, setObjectifs]       = useState(null)
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances]           = useState([])
  const [loading, setLoading]           = useState(true)

  const [repasInput, setRepasInput]     = useState('')
  const [repasJour, setRepasJour]       = useState([])
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [showFavoris, setShowFavoris]   = useState(false)
  const [favoris, setFavoris]           = useState([])
  const [totalMacros, setTotalMacros]   = useState({ kcal: 0, proteines: 0, glucides: 0, lipides: 0 })

  const today = new Date().toISOString().split('T')[0]
  const accentBtn  = theme.isFemme ? 'bg-pink-600 hover:bg-pink-700 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'
  const accentText = theme.isFemme ? 'text-pink-600' : 'text-brand-600'
  const accentBg   = theme.isFemme ? 'bg-pink-600' : 'bg-brand-600'

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    const [blocsRes, streakRes] = await Promise.all([
      supabase
        .from('blocs')
        .select('id, name, objectifs_bloc(*)')
        .eq('athlete_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('data_tracking')
        .select('date')
        .eq('athlete_id', profile.id)
        .eq('sport_fait', true)
        .order('date', { ascending: false })
        .limit(30),
    ])

    const blocs = blocsRes.data
    if (blocs?.[0]) {
      const obj = Array.isArray(blocs[0].objectifs_bloc) ? blocs[0].objectifs_bloc[0] : blocs[0].objectifs_bloc
      setObjectifs(obj)
      fetchSemaines(blocs[0].id)
    } else {
      setLoading(false)
    }

    // Calcul streak
    let s = 0
    const dates = (streakRes.data || []).map(t => t.date).sort().reverse()
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date()
      expected.setDate(expected.getDate() - i)
      if (dates[i] === expected.toISOString().split('T')[0]) s++; else break
    }
    setStreak(s)

    fetchRepasJour()
    fetchFavoris()
  }

  async function fetchSemaines(blocId) {
    const { data: semaines } = await supabase
      .from('semaines')
      .select('id, numero')
      .eq('bloc_id', blocId)
      .order('numero')
    if (!semaines?.length) { setLoading(false); return }

    const activeSem = await findActiveSemaine(semaines, profile.id)
    setActiveSemaine(activeSem)

    const { data: sc } = await supabase
      .from('seances')
      .select('id, nom, ordre, exercices(id, series_realisees(id))')
      .eq('semaine_id', activeSem.id)
      .order('ordre')
    setSeances(sc || [])

    const incomplete = (sc || []).find(s =>
      s.nom !== 'Bonus' &&
      (s.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0) < (s.exercices?.length || 0)
    )
    if (incomplete) setNextSeance({ seance: incomplete, semaineId: activeSem.id })
    setLoading(false)
  }

  async function fetchRepasJour() {
    const { data } = await supabase
      .from('repas')
      .select('*')
      .eq('athlete_id', profile.id)
      .eq('date', today)
      .order('created_at')
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
    const { data } = await supabase
      .from('repas_favoris')
      .select('*')
      .eq('athlete_id', profile.id)
      .order('nom')
    setFavoris(data || [])
  }

  async function analyzeRepas() {
    if (!repasInput.trim()) return
    setAnalyzeLoading(true)
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: `Expert nutrition. Réponds UNIQUEMENT avec du JSON valide, sans markdown:
{"kcal":number,"proteines":number,"glucides":number,"lipides":number}
Estimation basée sur des portions standard si non précisé.`,
          messages: [{ role: 'user', content: repasInput }]
        })
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || '{}'
      const macros = JSON.parse(text.replace(/```[a-z]*|```/g, '').trim())

      const newRepas = {
        athlete_id: profile.id,
        date: today,
        description: repasInput.trim(),
        kcal:      Math.round(macros.kcal      || 0),
        proteines: Math.round((macros.proteines || 0) * 10) / 10,
        glucides:  Math.round((macros.glucides  || 0) * 10) / 10,
        lipides:   Math.round((macros.lipides   || 0) * 10) / 10,
      }

      await supabase.from('repas').insert(newRepas)
      setRepasInput('')

      // Recalcul complet des totaux après ajout (fix: on refetch plutôt que de calculer à la main)
      const { data: allRepas } = await supabase
        .from('repas')
        .select('*')
        .eq('athlete_id', profile.id)
        .eq('date', today)
        .order('created_at')
      const list = allRepas || []
      setRepasJour(list)
      const newTotals = recalcTotals(list)

      // Sync data_tracking avec les totaux corrects
      const { data: blocs } = await supabase
        .from('blocs')
        .select('id')
        .eq('athlete_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
      const bloc_id = blocs?.[0]?.id
      if (bloc_id) {
        await supabase.from('data_tracking').upsert({
          athlete_id: profile.id,
          date: today,
          bloc_id,
          kcal:      Math.round(newTotals.kcal),
          proteines: Math.round(newTotals.proteines * 10) / 10,
          glucides:  Math.round(newTotals.glucides  * 10) / 10,
          lipides:   Math.round(newTotals.lipides   * 10) / 10,
        }, { onConflict: 'athlete_id,date' })
      }
    } catch (e) {
      console.error('analyzeRepas:', e)
    }
    setAnalyzeLoading(false)
  }

  async function addFavori(repas) {
    await supabase.from('repas').insert({
      athlete_id: profile.id,
      date: today,
      description: repas.description,
      kcal: repas.kcal,
      proteines: repas.proteines,
      glucides: repas.glucides,
      lipides: repas.lipides,
    })
    await fetchRepasJour()
    setShowFavoris(false)
  }

  async function saveAsFavori(repas) {
    const nom = window.prompt('Nom de ce repas favori ?', repas.description.slice(0, 40))
    if (!nom) return
    await supabase.from('repas_favoris').insert({
      athlete_id: profile.id,
      nom,
      description: repas.description,
      kcal: repas.kcal,
      proteines: repas.proteines,
      glucides: repas.glucides,
      lipides: repas.lipides,
    })
    await fetchFavoris()
  }

  async function deleteRepas(id) {
    await supabase.from('repas').delete().eq('id', id)
    await fetchRepasJour()
  }
  async function deleteFavori(id) {
    await supabase.from('repas_favoris').delete().eq('id', id)
    await fetchFavoris()
  }

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

  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Layout>
      {showConfig && <WidgetConfig onClose={() => setShowConfig(false)} />}

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
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {isWidgetEnabled('next_seance') && nextSeance && (
            <div className={`${accentBg} text-white rounded-2xl p-4`}>
              <p className="text-xs font-medium opacity-70 mb-0.5">Prochaine séance</p>
              <p className="text-base font-semibold mb-2">{nextSeance.seance.nom}</p>
              <button
                onClick={() => navigate(`/athlete/seance/${nextSeance.seance.id}/semaine/${nextSeance.semaineId}`)}
                className="bg-white px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-90"
                style={{ color: theme.isFemme ? '#db2777' : '#4f46e5' }}>
                Commencer
              </button>
            </div>
          )}

          {isWidgetEnabled('streak') && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-xl font-semibold text-amber-500">{streak}</p>
                <p className="text-xs text-gray-400 mt-0.5">jours consécutifs</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-xl font-semibold text-gray-900">{Math.round(totalMacros.kcal) || '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">kcal aujourd'hui</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className={`text-xl font-semibold ${Math.round(totalMacros.proteines) > 0 ? accentText : 'text-gray-300'}`}>
                  {Math.round(totalMacros.proteines) || '—'}g
                </p>
                <p className="text-xs text-gray-400 mt-0.5">protéines</p>
              </div>
            </div>
          )}

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
                  {favoris.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Aucun repas enregistré.</p>
                  ) : favoris.map(f => (
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
                <input
                  value={repasInput}
                  onChange={e => setRepasInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && analyzeRepas()}
                  placeholder="Ex: 2 oeufs, 80g flocons, 200ml lait…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  onClick={analyzeRepas}
                  disabled={analyzeLoading || !repasInput.trim()}
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
                    <span>
                      {Math.round(totalMacros.kcal)} kcal · P{Math.round(totalMacros.proteines)}g G{Math.round(totalMacros.glucides)}g L{Math.round(totalMacros.lipides)}g
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

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
