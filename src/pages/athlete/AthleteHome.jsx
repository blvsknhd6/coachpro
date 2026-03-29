import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'

export default function AthleteHome() {
  const { profile } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const [nextSeance, setNextSeance] = useState(null)
  const [todayTracking, setTodayTracking] = useState(null)
  const [objectifs, setObjectifs] = useState(null)
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeSemaine, setActiveSemaine] = useState(null)
  const [seances, setSeances] = useState([])
  // Nutrition IA
  const [repasInput, setRepasInput] = useState('')
  const [repasJour, setRepasJour] = useState([])
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [showFavoris, setShowFavoris] = useState(false)
  const [favoris, setFavoris] = useState([])
  const [totalMacros, setTotalMacros] = useState({ kcal: 0, proteines: 0, glucides: 0, lipides: 0 })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    const { data: blocs } = await supabase.from('blocs').select('*, objectifs_bloc(*)').eq('athlete_id', profile.id).order('created_at', { ascending: false }).limit(1)
    if (blocs?.[0]) {
      const obj = Array.isArray(blocs[0].objectifs_bloc) ? blocs[0].objectifs_bloc[0] : blocs[0].objectifs_bloc
      setObjectifs(obj)
      const { data: semaines } = await supabase.from('semaines').select('*').eq('bloc_id', blocs[0].id).order('numero')
      if (semaines?.length) {
        let activeSem = semaines[0]
        for (let i = semaines.length - 1; i >= 0; i--) {
          const { data: scIds } = await supabase.from('seances').select('id').eq('semaine_id', semaines[i].id)
          if (!scIds?.length) continue
          const { data: sr } = await supabase.from('series_realisees').select('id').eq('athlete_id', profile.id).in('exercice_id', scIds.map(s => s.id)).limit(1)
          if (sr?.length) { activeSem = semaines[i]; break }
        }
        setActiveSemaine(activeSem)
        const { data: sc } = await supabase.from('seances')
          .select('*, exercices(*, series_realisees(id))')
          .eq('semaine_id', activeSem.id).order('ordre')
        setSeances(sc || [])
        const incomplete = (sc || []).find(s => s.nom !== 'Bonus' &&
          (s.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0) < (s.exercices?.length || 0))
        if (incomplete) setNextSeance({ seance: incomplete, semaineId: activeSem.id })
      }
    }

    const { data: tracking } = await supabase.from('data_tracking').select('*').eq('athlete_id', profile.id).eq('date', today).single()
    setTodayTracking(tracking)

    // Streak
    const { data: recentTracking } = await supabase.from('data_tracking').select('date').eq('athlete_id', profile.id).eq('sport_fait', true).order('date', { ascending: false }).limit(30)
    let s = 0
    const dates = (recentTracking || []).map(t => t.date).sort().reverse()
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(); expected.setDate(expected.getDate() - i)
      if (dates[i] === expected.toISOString().split('T')[0]) s++; else break
    }
    setStreak(s)

    // Repas du jour
    await fetchRepasJour()
    await fetchFavoris()
    setLoading(false)
  }

  async function fetchRepasJour() {
    const { data } = await supabase.from('repas').select('*').eq('athlete_id', profile.id).eq('date', today).order('created_at')
    const list = data || []
    setRepasJour(list)
    const totals = list.reduce((acc, r) => ({
      kcal: acc.kcal + (r.kcal || 0),
      proteines: acc.proteines + (Number(r.proteines) || 0),
      glucides: acc.glucides + (Number(r.glucides) || 0),
      lipides: acc.lipides + (Number(r.lipides) || 0),
    }), { kcal: 0, proteines: 0, glucides: 0, lipides: 0 })
    setTotalMacros(totals)
    // Sync avec data_tracking
    if (list.length > 0) {
      await supabase.from('data_tracking').upsert({
        athlete_id: profile.id,
        date: today,
        bloc_id: (await supabase.from('blocs').select('id').eq('athlete_id', profile.id).order('created_at', { ascending: false }).limit(1)).data?.[0]?.id,
        kcal: Math.round(totals.kcal),
        proteines: Math.round(totals.proteines * 10) / 10,
        glucides: Math.round(totals.glucides * 10) / 10,
        lipides: Math.round(totals.lipides * 10) / 10,
      }, { onConflict: 'athlete_id,date', ignoreDuplicates: false })
    }
  }

  async function fetchFavoris() {
    const { data } = await supabase.from('repas_favoris').select('*').eq('athlete_id', profile.id).order('nom')
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
          max_tokens: 400,
          system: `Tu es un expert en nutrition. L'utilisateur décrit un repas en français. Extrais les macronutriments.
Réponds UNIQUEMENT avec un JSON valide, rien d'autre, sans markdown:
{"kcal": number, "proteines": number, "glucides": number, "lipides": number, "description_courte": "string"}
Sois précis dans ton estimation. Si une quantité n'est pas précisée, utilise une portion standard.`,
          messages: [{ role: 'user', content: repasInput }]
        })
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || '{}'
      const macros = JSON.parse(text.replace(/```json|```/g, '').trim())

      const { error } = await supabase.from('repas').insert({
        athlete_id: profile.id,
        date: today,
        description: repasInput.trim(),
        kcal: Math.round(macros.kcal || 0),
        proteines: Math.round((macros.proteines || 0) * 10) / 10,
        glucides: Math.round((macros.glucides || 0) * 10) / 10,
        lipides: Math.round((macros.lipides || 0) * 10) / 10,
      })

      if (!error) {
        setRepasInput('')
        await fetchRepasJour()
      }
    } catch (e) {
      console.error('Erreur analyse repas:', e)
    }
    setAnalyzeLoading(false)
  }

  async function addFavori(repas) {
    await supabase.from('repas').insert({
      athlete_id: profile.id, date: today,
      description: repas.description, kcal: repas.kcal,
      proteines: repas.proteines, glucides: repas.glucides, lipides: repas.lipides,
    })
    await fetchRepasJour()
    setShowFavoris(false)
  }

  async function saveAsFavori(repas) {
    const nom = prompt('Nom de ce repas favori ?', repas.description.slice(0, 40))
    if (!nom) return
    await supabase.from('repas_favoris').insert({
      athlete_id: profile.id, nom, description: repas.description,
      kcal: repas.kcal, proteines: repas.proteines, glucides: repas.glucides, lipides: repas.lipides,
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

  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const accentColor = theme.isFemme ? '#db2777' : '#4f46e5'
  const bgBtn = theme.isFemme ? 'bg-pink-600 hover:bg-pink-700' : 'bg-brand-600 hover:bg-brand-700'

  const MacroBar = ({ label, val, target, color }) => {
    const pct = target && val ? Math.min(100, Math.round((val / target) * 100)) : 0
    return (
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500">{label}</span>
          <span className="text-gray-700 font-medium">{Math.round(val || 0)}{label === 'Kcal' ? '' : 'g'} / {target || '—'}{target && label !== 'Kcal' ? 'g' : ''}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="mb-6">
        <p className="text-sm text-gray-400 capitalize">{todayLabel}</p>
        <h1 className="text-2xl font-semibold text-gray-900">Bonjour {profile?.full_name?.split(' ')[0]} 👋</h1>
      </div>

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-4">
          {/* Prochaine séance */}
          {nextSeance && (
            <div className={`${theme.isFemme ? 'bg-pink-600' : 'bg-brand-600'} text-white rounded-2xl p-5`}>
              <p className="text-xs font-medium opacity-70 mb-1">Prochaine séance</p>
              <p className="text-lg font-semibold mb-1">{nextSeance.seance.nom}</p>
              <p className="text-xs opacity-60 mb-3">{nextSeance.seance.exercices?.length || 0} exercices</p>
              <button onClick={() => navigate(`/athlete/seance/${nextSeance.seance.id}/semaine/${nextSeance.semaineId}`)}
                className="bg-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ color: accentColor }}>
                Commencer →
              </button>
            </div>
          )}

          {/* Stats rapides */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-amber-500">🔥{streak}</p>
              <p className="text-xs text-gray-400 mt-1">Jours consécutifs</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className={`text-2xl font-semibold ${todayTracking?.sport_fait ? 'text-green-500' : 'text-gray-300'}`}>
                {todayTracking?.sport_fait ? '✓' : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Sport aujourd'hui</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-xl font-semibold text-gray-900">{Math.round(totalMacros.kcal) || '—'}</p>
              <p className="text-xs text-gray-400 mt-1">Kcal aujourd'hui</p>
            </div>
          </div>

          {/* Saisie nutrition IA */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">🍽️ Ajouter un repas</p>
              <button onClick={() => setShowFavoris(v => !v)}
                className={`text-xs px-3 py-1 rounded-lg border transition-colors ${showFavoris ? `${theme.isFemme ? 'border-pink-300 text-pink-600 bg-pink-50' : 'border-brand-300 text-brand-600 bg-brand-50'}` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                ⭐ Mes repas
              </button>
            </div>

            {/* Favoris */}
            {showFavoris && (
              <div className="mb-3 space-y-1.5 max-h-48 overflow-y-auto">
                {favoris.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Aucun repas favori. Sauvegarde un repas avec ⭐ après l'avoir analysé.</p>
                ) : favoris.map(f => (
                  <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{f.nom}</p>
                      <p className="text-xs text-gray-400">{f.kcal} kcal · P{Math.round(f.proteines)}g G{Math.round(f.glucides)}g L{Math.round(f.lipides)}g</p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => addFavori(f)}
                        className={`text-xs px-2 py-1 rounded-lg ${bgBtn} text-white`}>
                        + Ajouter
                      </button>
                      <button onClick={() => deleteFavori(f.id)} className="text-xs text-gray-300 hover:text-red-400 px-1">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Champ saisie */}
            <div className="flex gap-2">
              <input
                value={repasInput}
                onChange={e => setRepasInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && analyzeRepas()}
                placeholder="Ex: 2 œufs brouillés, 80g de flocons d'avoine, 200ml lait…"
                className={`flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${theme.isFemme ? 'focus:ring-pink-300' : 'focus:ring-brand-400'}`}
              />
              <button onClick={analyzeRepas} disabled={analyzeLoading || !repasInput.trim()}
                className={`${bgBtn} text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex-shrink-0`}>
                {analyzeLoading ? '…' : '✓'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">L'IA analyse ton repas et calcule les macros automatiquement.</p>

            {/* Liste repas du jour */}
            {repasJour.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {repasJour.map(r => (
                  <div key={r.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{r.description}</p>
                      <p className={`text-xs font-medium mt-0.5 ${theme.isFemme ? 'text-pink-600' : 'text-brand-600'}`}>
                        {r.kcal} kcal · P{Math.round(r.proteines)}g G{Math.round(r.glucides)}g L{Math.round(r.lipides)}g
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => saveAsFavori(r)} className="text-xs text-gray-300 hover:text-amber-400 transition-colors" title="Sauvegarder en favori">⭐</button>
                      <button onClick={() => deleteRepas(r.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">×</button>
                    </div>
                  </div>
                ))}
                {/* Total */}
                <div className={`flex justify-between px-3 py-2 rounded-lg text-xs font-medium ${theme.isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700'}`}>
                  <span>Total aujourd'hui</span>
                  <span>{Math.round(totalMacros.kcal)} kcal · P{Math.round(totalMacros.proteines)}g G{Math.round(totalMacros.glucides)}g L{Math.round(totalMacros.lipides)}g</span>
                </div>
              </div>
            )}
          </div>

          {/* Barres macros vs objectifs */}
          {objectifs && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Objectifs nutritionnels</p>
                <Link to="/athlete/tracking" className={`text-xs ${theme.isFemme ? 'text-pink-600' : 'text-brand-600'} font-medium`}>Suivi complet →</Link>
              </div>
              <div className="space-y-3">
                <MacroBar label="Kcal" val={totalMacros.kcal} target={objectifs.kcal} color={theme.isFemme ? 'bg-pink-500' : 'bg-brand-500'} />
                <MacroBar label="Protéines" val={totalMacros.proteines} target={objectifs.proteines} color={theme.isFemme ? 'bg-pink-400' : 'bg-brand-400'} />
                <MacroBar label="Glucides" val={totalMacros.glucides} target={objectifs.glucides} color="bg-green-500" />
                <MacroBar label="Lipides" val={totalMacros.lipides} target={objectifs.lipides} color="bg-orange-400" />
              </div>
            </div>
          )}

          {/* Séances de la semaine */}
          {seances.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Semaine {activeSemaine?.numero}</p>
                <Link to="/athlete/seances" className={`text-xs ${theme.isFemme ? 'text-pink-600' : 'text-brand-600'} font-medium`}>Voir tout →</Link>
              </div>
              <div className="space-y-2">
                {seances.filter(s => s.nom !== 'Bonus').map(sc => {
                  const total = sc.exercices?.length || 0
                  const done = sc.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0
                  const complete = done >= total && total > 0
                  return (
                    <Link key={sc.id} to={`/athlete/seance/${sc.id}/semaine/${activeSemaine?.id}`}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${complete ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                      <span className={`text-sm ${complete ? 'text-green-700' : 'text-gray-700'}`}>{sc.nom}</span>
                      <span className={`text-xs ${complete ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                        {complete ? '✓ Terminé' : `${done}/${total}`}
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
