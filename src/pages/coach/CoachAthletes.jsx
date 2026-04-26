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
  const [form, setForm]           = useState({ full_name: '', email: '', genre: 'femme' })
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  // Suppression
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name }
  const [deleting, setDeleting]           = useState(false)
  const [deleteErr, setDeleteErr]         = useState('')

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
    const athIds      = aths.map(a => a.id)
    const sevenAgo    = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7)
    const sevenAgoStr = sevenAgo.toISOString().split('T')[0]

    const [trackingRes, blocsRes] = await Promise.all([
      supabase.from('data_tracking')
        .select('athlete_id, date, sport_fait, kcal, proteines, glucides, lipides, sommeil, pas_journaliers, stress')
        .in('athlete_id', athIds).gte('date', sevenAgoStr).order('date'),
      supabase.from('blocs')
        .select('athlete_id, objectifs_bloc(*)')
        .in('athlete_id', athIds).order('created_at', { ascending: false }),
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

    const objMap = {}; const seen = new Set()
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

  async function handleInvite(e) {
    e.preventDefault()
    setSaving(true); setErr('')

    try {
      const response = await fetch('/api/invite-athlete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     form.email,
          full_name: form.full_name,
          coach_id:  profile.id,
          genre:     form.genre,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'invitation')
      }

      if (data.user_id) {
        await supabase.from('profiles').update({ genre: form.genre }).eq('id', data.user_id)
      }

      setInviteSent(true)
      setForm({ full_name: '', email: '', genre: 'femme' })
      setTimeout(() => {
        setInviteSent(false)
        setShowAdd(false)
        fetchAthletes()
      }, 3000)

    } catch (e) {
      setErr(e.message)
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true); setDeleteErr('')

    try {
      const response = await fetch('/api/delete-athlete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: confirmDelete.id,
          coach_id:   profile.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression')
      }

      // Retirer de la liste locale
      setAthletes(prev => prev.filter(a => a.id !== confirmDelete.id))
      setConfirmDelete(null)

    } catch (e) {
      setDeleteErr(e.message)
    }

    setDeleting(false)
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
      {/* ── Modale confirmation suppression ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-red-500 text-lg">🗑</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Supprimer ce coaché ?</h3>
                <p className="text-sm text-gray-500">{confirmDelete.name}</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-red-700 font-medium mb-1">Cette action est irréversible.</p>
              <p className="text-xs text-red-600">
                Tous les programmes, séances, séries réalisées et données de suivi de cet athlète seront définitivement supprimés.
              </p>
            </div>
            {deleteErr && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{deleteErr}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 transition-colors">
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
              <button
                onClick={() => { setConfirmDelete(null); setDeleteErr('') }}
                disabled={deleting}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link to="/coach" className="text-sm text-gray-400 hover:text-gray-700">← Accueil</Link>
        <h1 className="text-xl font-semibold flex-1">Mes coachés</h1>
        <button onClick={() => setShowAdd(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
          + Inviter
        </button>
      </div>

      {/* ── Modale invitation ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            {inviteSent ? (
              <div className="text-center py-4">
                <p className="text-3xl mb-3">✉️</p>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Invitation envoyée !</h2>
                <p className="text-sm text-gray-500">
                  L'athlète recevra un email avec un lien pour compléter son profil et créer son mot de passe.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold mb-1">Inviter un(e) coaché(e)</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Un email d'invitation sera envoyé. L'athlète complétera son profil et créera son mot de passe.
                </p>
                <form onSubmit={handleInvite} className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Prénom et nom</label>
                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Marie Dupont"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Genre</label>
                    <div className="mt-1 flex gap-2">
                      {['femme', 'homme'].map(g => (
                        <button key={g} type="button"
                          onClick={() => setForm(f => ({ ...f, genre: g }))}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.genre === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                          {g === 'femme' ? '♀ Femme' : '♂ Homme'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                  {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={saving || !form.email}
                      className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                      {saving ? 'Envoi…' : '✉️ Envoyer l\'invitation'}
                    </button>
                    <button type="button" onClick={() => { setShowAdd(false); setErr('') }}
                      className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">
                      Annuler
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement…</p>
      ) : athletes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm mb-2">Aucun coaché pour l'instant.</p>
          <button onClick={() => setShowAdd(true)}
            className="text-sm text-brand-600 font-medium hover:text-brand-800">
            Inviter un premier athlète →
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map(a => {
            const tr  = athleteTracking[a.id]
            const obj = athleteObjectifs[a.id]
            const b   = obj?.bornes || {}
            return (
              <div key={a.id} className="relative group">
                <Link
                  to={`/coach/athlete/${a.id}`}
                  className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all block">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${a.genre === 'femme' ? 'bg-pink-100 text-pink-700' : 'bg-brand-100 text-brand-700'}`}>
                      {initiales(a.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 truncate">{a.full_name}</p>
                        {a.is_self && (
                          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Moi</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {a.genre === 'femme' ? '♀' : '♂'} · {(a.blocs || []).length} bloc{(a.blocs || []).length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

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
                      <p className="text-xs text-gray-400">
                        {a.taille || a.date_naissance
                          ? 'Aucune donnée ces 7 derniers jours'
                          : 'En attente de complétion du profil…'}
                      </p>
                    </div>
                  )}
                </Link>

                {/* ── Bouton suppression (visible au hover, caché pour is_self) ── */}
                {!a.is_self && (
                  <button
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setConfirmDelete({ id: a.id, name: a.full_name })
                      setDeleteErr('')
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center shadow-sm"
                    title="Supprimer ce coaché">
                    <svg className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" fill="none" viewBox="0 0 16 16">
                      <path d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 004.5 14h7a.5.5 0 00.5-.5L13 4"
                        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
