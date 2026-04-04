import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import { metricColor, computeAverages } from '../../lib/tracking'

export default function CoachAthletes() {
  const { profile } = useAuth()
  const [athletes, setAthletes]                 = useState([])
  const [athleteTracking, setAthleteTracking]   = useState({})
  const [athleteObjectifs, setAthleteObjectifs] = useState({})
  const [loading, setLoading]                   = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm]           = useState({ full_name: '', email: '', password: '', genre: 'homme' })
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  useEffect(() => { fetchAthletes() }, [profile])

  async function fetchAthletes() {
    if (!profile) return
    const { data } = await supabase.from('profiles').select('*, blocs(id)')
      .eq('coach_id', profile.id)
      .order('is_self', { ascending: false })
      .order('full_name')
    setAthletes(data || [])
    if (data?.length) fetchTrackingData(data)
    else setLoading(false)
  }

  async function fetchTrackingData(aths) {
    const athIds     = aths.map(a => a.id)
    const sevenAgo   = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7)
    const sevenAgoStr = sevenAgo.toISOString().split('T')[0]

    const [trackingRes, blocsRes] = await Promise.all([
      supabase.from('data_tracking')
        .select('athlete_id, date, sport_fait, kcal, proteines, glucides, lipides, sommeil, pas_journaliers, stress')
        .in('athlete_id', athIds)
        .gte('date', sevenAgoStr)
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
      const avgs = computeAverages(entries, ['kcal', 'proteines', 'glucides', 'lipides', 'sommeil', 'stress', 'pas'])
      trackingMap[athId] = {
        avgs,
        sportJours: entries.filter(e => e.sport_fait).length,
        lastDate:   entries[entries.length - 1]?.date,
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
    setLoading(false)
  }

  async function handleAddAthlete(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: form.email, password: form.password })
      if (authError) throw authError
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id, role: 'athlete', full_name: form.full_name,
        email: form.email, genre: form.genre, coach_id: profile.id, is_self: false,
      })
      if (profileError) throw profileError
      setForm({ full_name: '', email: '', password: '', genre: 'homme' })
      setShowAdd(false)
      fetchAthletes()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  function relativeDate(dateStr) {
    if (!dateStr) return 'jamais'
    const diff = Math.floor((new Date() - new Date(dateStr + 'T12:00:00')) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

  const initiales = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/coach" className="text-sm text-gray-400 hover:text-gray-700">← Accueil</Link>
        <h1 className="text-xl font-semibold flex-1">Mes coachés</h1>
        <button onClick={() => setShowAdd(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
          + Ajouter
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-base font-semibold mb-4">Nouveau coaché</h2>
            <form onSubmit={handleAddAthlete} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Nom complet</label>
                <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Genre</label>
                <div className="mt-1 flex gap-2">
                  {['homme', 'femme'].map(g => (
                    <button key={g} type="button" onClick={() => setForm(f => ({ ...f, genre: g }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.genre === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                      {g === 'homme' ? '♂ Homme' : '♀ Femme'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input type="email" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mot de passe temporaire</label>
                <input type="text" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                  {saving ? 'Création…' : 'Créer le compte'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map(a => {
            const tr  = athleteTracking[a.id]
            const obj = athleteObjectifs[a.id]
            const b   = obj?.bornes || {}
            return (
              <Link key={a.id} to={`/coach/athlete/${a.id}`}
                className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all group">
                {/* En-tête */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${a.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                    {initiales(a.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 truncate">{a.full_name}</p>
                      {a.is_self && <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Moi</span>}
                    </div>
                    <p className="text-xs text-gray-400">
                      {a.genre === 'femme' ? '♀' : '♂'} · {(a.blocs || []).length} bloc{(a.blocs || []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Tracking 7j */}
                {tr ? (
                  <div className="border-t border-gray-50 pt-3">
                    <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                      <div>
                        <p className="text-xs text-gray-400">Sport</p>
                        <p className={`text-xs font-semibold ${metricColor(tr.sportJours, 'seances', obj, b) || 'text-gray-700'}`}>
                          {tr.sportJours}/7j
                        </p>
                      </div>
                      {tr.avgs.kcal != null && (
                        <div>
                          <p className="text-xs text-gray-400">Kcal</p>
                          <p className={`text-xs font-semibold ${metricColor(tr.avgs.kcal, 'kcal', obj, b) || 'text-gray-700'}`}>
                            {Math.round(tr.avgs.kcal)}
                          </p>
                        </div>
                      )}
                      {tr.avgs.proteines != null && (
                        <div>
                          <p className="text-xs text-gray-400">Prot.</p>
                          <p className={`text-xs font-semibold ${metricColor(tr.avgs.proteines, 'proteines', obj, b) || 'text-gray-700'}`}>
                            {Math.round(tr.avgs.proteines)}g
                          </p>
                        </div>
                      )}
                      {tr.avgs.sommeil != null && (
                        <div>
                          <p className="text-xs text-gray-400">Sommeil</p>
                          <p className={`text-xs font-semibold ${metricColor(tr.avgs.sommeil, 'sommeil', obj, b) || 'text-gray-700'}`}>
                            {parseFloat(tr.avgs.sommeil).toFixed(1)}h
                          </p>
                        </div>
                      )}
                      {tr.avgs.stress != null && (
                        <div>
                          <p className="text-xs text-gray-400">Stress</p>
                          <p className={`text-xs font-semibold ${metricColor(tr.avgs.stress, 'stress', obj, b) || 'text-gray-700'}`}>
                            {parseFloat(tr.avgs.stress).toFixed(1)}/10
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-400">Dernier</p>
                        <p className="text-xs text-gray-500">{relativeDate(tr.lastDate)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-gray-50 pt-3">
                    <p className="text-xs text-gray-400">Aucune donnée ces 7 derniers jours</p>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
