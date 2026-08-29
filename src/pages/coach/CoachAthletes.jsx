import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import { metricColor, computeAverages } from '../../lib/tracking'
import { getCycleStatus } from '../../lib/cycleUtils'

const PHASE_COLOR_CLASSES = {
  red:    'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  green:  'bg-green-100 text-green-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
}

export default function CoachAthletes() {
  const { profile } = useAuth()

  const [athletes, setAthletes]                 = useState([])
  const [athleteTracking, setAthleteTracking]   = useState({})
  const [athleteObjectifs, setAthleteObjectifs] = useState({})
  const [athleteCycle, setAthleteCycle]         = useState({})
  const [loading, setLoading]                   = useState(true)

  const [showAdd, setShowAdd]                   = useState(false)
  const [sendInvite, setSendInvite]             = useState(true)

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    genre: 'femme'
  })

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [inviteLink, setInviteLink] = useState('')

  // Invitation depuis la liste
  const [sendingInvite, setSendingInvite] = useState(null)

  // Suppression
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  useEffect(() => {
    fetchAthletes()
  }, [profile])

  async function fetchAthletes() {
    if (!profile) return

    const { data } = await supabase
      .from('profiles')
      .select('*, blocs(id)')
      .eq('coach_id', profile.id)
      .order('is_self', { ascending: false })
      .order('full_name')

    setAthletes(data || [])

    if (data?.length) {
      fetchTrackingData(data)
    } else {
      setLoading(false)
    }
  }

  async function fetchTrackingData(aths) {
    const athIds = aths.map(a => a.id)

    const sevenAgo = new Date()
    sevenAgo.setDate(sevenAgo.getDate() - 7)

    const sevenAgoStr =
      sevenAgo.toISOString().split('T')[0]

    const [trackingRes, blocsRes] = await Promise.all([
      supabase
        .from('data_tracking')
        .select(
          'athlete_id, date, sport_fait, kcal, proteines, glucides, lipides, sommeil, pas_journaliers, stress'
        )
        .in('athlete_id', athIds)
        .gte('date', sevenAgoStr)
        .order('date'),

      supabase
        .from('blocs')
        .select('athlete_id, objectifs_bloc(*)')
        .in('athlete_id', athIds)
        .order('created_at', { ascending: false }),
    ])

    const trackingMap = {}

    for (const athId of athIds) {
      const entries =
        (trackingRes.data || [])
          .filter(t => t.athlete_id === athId)

      if (!entries.length) {
        trackingMap[athId] = null
        continue
      }

      const avgs = computeAverages(
        entries,
        [
          'kcal',
          'proteines',
          'glucides',
          'lipides',
          'sommeil',
          'stress',
          'pas'
        ]
      )

      trackingMap[athId] = {
        avgs,
        sportJours: entries.filter(e => e.sport_fait).length,
        lastDate: entries[entries.length - 1]?.date,
      }
    }

    setAthleteTracking(trackingMap)

    const objMap = {}
    const seen = new Set()

    for (const bloc of (blocsRes.data || [])) {
      if (!seen.has(bloc.athlete_id)) {
        seen.add(bloc.athlete_id)

        objMap[bloc.athlete_id] =
          Array.isArray(bloc.objectifs_bloc)
            ? bloc.objectifs_bloc[0]
            : bloc.objectifs_bloc
      }
    }

    setAthleteObjectifs(objMap)

    // Cycle
    const femaleIds =
      aths
        .filter(
          a =>
            a.genre === 'femme' &&
            !a.is_self
        )
        .map(a => a.id)

    if (femaleIds.length) {
      const { data: cycleLogs } =
        await supabase
          .from('period_logs')
          .select('*')
          .in('user_id', femaleIds)
          .order(
            'period_start_date',
            { ascending: false }
          )

      const cycleMap = {}

      for (const id of femaleIds) {
        const logs =
          (cycleLogs || [])
            .filter(l => l.user_id === id)

        cycleMap[id] =
          logs.length
            ? getCycleStatus(logs)
            : null
      }

      setAthleteCycle(cycleMap)
    }

    setLoading(false)
  }

  // ============================================================
  // CRÉATION D'UN ATHLÈTE
  // ============================================================

  async function handleSubmit(e) {
    e.preventDefault()

    setSaving(true)
    setErr('')
    setSuccess('')
    setInviteLink('')

    try {
      const endpoint =
        sendInvite
          ? '/api/invite-athlete'
          : '/api/create-athlete'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: form.email,
          full_name: form.full_name,
          coach_id: profile.id,
          genre: form.genre,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erreur'
        )
      }

      if (data.user_id) {
        await supabase
          .from('profiles')
          .update({
            genre: form.genre
          })
          .eq('id', data.user_id)
      }

      if (sendInvite) {
        if (!data.action_link) {
          throw new Error(
            'Le lien d’accès a été créé mais n’a pas été retourné.'
          )
        }

        setInviteLink(data.action_link)

        setSuccess(
          `Lien d'accès généré pour ${form.email}`
        )
      } else {
        setSuccess(
          `Profil créé pour ${form.email}. Tu pourras générer le lien plus tard. ✓`
        )
      }

      setForm({
        full_name: '',
        email: '',
        genre: 'femme'
      })

      if (!sendInvite) {
        setTimeout(() => {
          setSuccess('')
          setShowAdd(false)
          fetchAthletes()
        }, 3000)
      }

    } catch (e) {
      setErr(e.message)
    }

    setSaving(false)
  }

  // ============================================================
  // GÉNÉRER UN LIEN POUR UN ATHLÈTE EXISTANT
  // ============================================================

  async function handleSendInvite(athlete) {
    setSendingInvite(athlete.id)

    try {
      const response =
        await fetch('/api/invite-athlete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: athlete.email,
            full_name: athlete.full_name,
            coach_id: profile.id,
            genre: athlete.genre,
          }),
        })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Erreur'
        )
      }

      if (!data.action_link) {
        throw new Error(
          'Le lien d’accès a été créé mais n’a pas été retourné.'
        )
      }

      // Affiche une petite fenêtre avec le lien à copier
      window.prompt(
        `Lien d'accès pour ${athlete.full_name} :\n\nCopie ce lien puis envoie-le toi-même à l'athlète.`,
        data.action_link
      )

    } catch (e) {
      alert(e.message)
    }

    setSendingInvite(null)
  }

  // ============================================================
  // SUPPRESSION
  // ============================================================

  async function handleDelete() {
    if (!confirmDelete) return

    setDeleting(true)
    setDeleteErr('')

    try {
      const response =
        await fetch('/api/delete-athlete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            athlete_id: confirmDelete.id,
            coach_id: profile.id
          }),
        })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Erreur lors de la suppression'
        )
      }

      setAthletes(
        prev =>
          prev.filter(
            a => a.id !== confirmDelete.id
          )
      )

      setConfirmDelete(null)

    } catch (e) {
      setDeleteErr(e.message)
    }

    setDeleting(false)
  }

  function relativeDate(dateStr) {
    if (!dateStr) return 'jamais'

    const diff = Math.floor(
      (
        new Date() -
        new Date(dateStr + 'T12:00:00')
      ) / 86400000
    )

    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'

    return `il y a ${diff}j`
  }

  const isNotOnboarded =
    (a) =>
      !a.profil_complet &&
      !a.is_self

  const initiales =
    (name) =>
      name
        ?.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'

  return (
    <Layout>

      {/* MODALE SUPPRESSION */}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-red-500 text-lg">
                  🗑
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Supprimer ce coaché ?
                </h3>

                <p className="text-sm text-gray-500">
                  {confirmDelete.name}
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-red-700 font-medium mb-1">
                Cette action est irréversible.
              </p>

              <p className="text-xs text-red-600">
                Tous les programmes, séances, séries réalisées et données de suivi seront définitivement supprimés.
              </p>
            </div>

            {deleteErr && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">
                {deleteErr}
              </p>
            )}

            <div className="flex gap-2">

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {deleting
                  ? 'Suppression…'
                  : 'Supprimer définitivement'}
              </button>

              <button
                onClick={() => {
                  setConfirmDelete(null)
                  setDeleteErr('')
                }}
                disabled={deleting}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>

            </div>
          </div>
        </div>
      )}

      {/* HEADER */}

      <div className="flex items-center gap-3 mb-6">

        <Link
          to="/coach"
          className="text-sm text-gray-400 hover:text-gray-700"
        >
          ← Accueil
        </Link>

        <h1 className="text-xl font-semibold flex-1">
          Mes coachés
        </h1>

        <button
          onClick={() => {
            setShowAdd(true)
            setErr('')
            setSuccess('')
            setInviteLink('')
          }}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          + Ajouter
        </button>

      </div>

      {/* MODALE AJOUT */}

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">

          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">

            {success ? (

              <div className="py-4">

                <div className="text-center">

                  <p className="text-3xl mb-3">
                    {inviteLink ? '🔗' : '✅'}
                  </p>

                  <p className="text-sm text-gray-700 font-medium">
                    {success}
                  </p>

                </div>

                {inviteLink && (

                  <div className="mt-4">

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">

                      <p className="text-xs text-gray-400 mb-1">
                        Lien d'accès
                      </p>

                      <p className="text-xs text-gray-700 break-all select-all">
                        {inviteLink}
                      </p>

                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            inviteLink
                          )

                          setSuccess(
                            'Lien copié dans le presse-papiers ✓'
                          )

                        } catch {
                          window.prompt(
                            'Copie ce lien :',
                            inviteLink
                          )
                        }
                      }}
                      className="w-full mt-3 bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-700"
                    >
                      📋 Copier le lien
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAdd(false)
                        setSuccess('')
                        setInviteLink('')
                        fetchAthletes()
                      }}
                      className="w-full mt-2 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Fermer
                    </button>

                  </div>

                )}

              </div>

            ) : (

              <>

                <h2 className="text-base font-semibold mb-4">
                  Ajouter un(e) coaché(e)
                </h2>

                <form
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >

                  <div>

                    <label className="text-sm font-medium text-gray-700">
                      Prénom et nom
                    </label>

                    <input
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={form.full_name}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          full_name: e.target.value
                        }))
                      }
                      placeholder="Marie Dupont"
                    />

                  </div>

                  <div>

                    <label className="text-sm font-medium text-gray-700">
                      Genre
                    </label>

                    <div className="mt-1 flex gap-2">

                      {['femme', 'homme'].map(g => (

                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setForm(f => ({
                              ...f,
                              genre: g
                            }))
                          }
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            form.genre === g
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'border-gray-200 text-gray-600'
                          }`}
                        >
                          {g === 'femme'
                            ? '♀ Femme'
                            : '♂ Homme'}
                        </button>

                      ))}

                    </div>

                  </div>

                  <div>

                    <label className="text-sm font-medium text-gray-700">
                      Email
                    </label>

                    <input
                      type="email"
                      required
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={form.email}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          email: e.target.value
                        }))
                      }
                    />

                  </div>

                  {/* INVITATION */}

                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">

                    <p className="text-xs font-medium text-gray-600">
                      Accès
                    </p>

                    <div className="flex gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          setSendInvite(true)
                        }
                        className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                          sendInvite
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        🔗 Générer un lien
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSendInvite(false)
                        }
                        className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                          !sendInvite
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        🕐 Générer plus tard
                      </button>

                    </div>

                    <p className="text-xs text-gray-400">

                      {sendInvite
                        ? "Un lien d'accès sera généré. Tu pourras le copier et l'envoyer toi-même à l'athlète."
                        : "Le profil est créé sans lien. Tu pourras générer le lien depuis la liste quand tu veux."
                      }

                    </p>

                  </div>

                  {err && (
                    <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
                      {err}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">

                    <button
                      type="submit"
                      disabled={
                        saving ||
                        !form.email
                      }
                      className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                    >
                      {saving
                        ? 'Création…'
                        : sendInvite
                          ? '🔗 Créer et générer le lien'
                          : '✅ Créer le profil'
                      }
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAdd(false)
                        setErr('')
                        setInviteLink('')
                      }}
                      className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600"
                    >
                      Annuler
                    </button>

                  </div>

                </form>

              </>

            )}

          </div>

        </div>
      )}

      {/* LISTE */}

      {loading ? (

        <p className="text-gray-400 text-sm">
          Chargement…
        </p>

      ) : athletes.length === 0 ? (

        <div className="text-center py-16 text-gray-400">

          <p className="text-sm mb-2">
            Aucun coaché pour l'instant.
          </p>

          <button
            onClick={() => setShowAdd(true)}
            className="text-sm text-brand-600 font-medium hover:text-brand-800"
          >
            Ajouter un premier athlète →
          </button>

        </div>

      ) : (

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

          {athletes.map(a => {

            const tr = athleteTracking[a.id]
            const obj = athleteObjectifs[a.id]
            const b = obj?.bornes || {}
            const cycle = athleteCycle[a.id]
            const notOnboarded =
              isNotOnboarded(a)

            return (

              <div
                key={a.id}
                className="relative group"
              >

                <Link
                  to={`/coach/athlete/${a.id}`}
                  className="bg-white border border-gray-100 rounded-xl p-5 hover:border-brand-200 hover:shadow-sm transition-all block"
                >

                  <div className="flex items-center gap-3 mb-3">

                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                      a.genre === 'femme'
                        ? 'bg-pink-100 text-pink-700'
                        : 'bg-brand-100 text-brand-700'
                    }`}>
                      {initiales(a.full_name)}
                    </div>

                    <div className="flex-1 min-w-0">

                      <div className="flex items-center gap-2 flex-wrap">

                        <p className="font-medium text-sm text-gray-900 group-hover:text-brand-700 truncate">
                          {a.full_name}
                        </p>

                        {a.is_self && (
                          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            Moi
                          </span>
                        )}

                        {notOnboarded && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            En attente
                          </span>
                        )}

                      </div>

                      <p className="text-xs text-gray-400">
                        {a.genre === 'femme'
                          ? '♀'
                          : '♂'} · {(a.blocs || []).length} bloc{(a.blocs || []).length !== 1 ? 's' : ''}
                      </p>

                    </div>

                  </div>

                  {tr ? (

                    <div className="border-t border-gray-50 pt-3">

                      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">

                        <div>
                          <p className="text-xs text-gray-400">
                            Sport
                          </p>
                          <p className={`text-xs font-semibold ${
                            metricColor(
                              tr.sportJours,
                              'seances',
                              obj,
                              b
                            ) ||
                            'text-gray-700'
                          }`}>
                            {tr.sportJours}/7j
                          </p>
                        </div>

                        {tr.avgs.kcal != null && (
                          <div>
                            <p className="text-xs text-gray-400">
                              Kcal
                            </p>
                            <p className={`text-xs font-semibold ${
                              metricColor(
                                tr.avgs.kcal,
                                'kcal',
                                obj,
                                b
                              ) ||
                              'text-gray-700'
                            }`}>
                              {Math.round(tr.avgs.kcal)}
                            </p>
                          </div>
                        )}

                        {tr.avgs.proteines != null && (
                          <div>
                            <p className="text-xs text-gray-400">
                              Prot.
                            </p>
                            <p className={`text-xs font-semibold ${
                              metricColor(
                                tr.avgs.proteines,
                                'proteines',
                                obj,
                                b
                              ) ||
                              'text-gray-700'
                            }`}>
                              {Math.round(tr.avgs.proteines)}g
                            </p>
                          </div>
                        )}

                        {tr.avgs.sommeil != null && (
                          <div>
                            <p className="text-xs text-gray-400">
                              Sommeil
                            </p>
                            <p className={`text-xs font-semibold ${
                              metricColor(
                                tr.avgs.sommeil,
                                'sommeil',
                                obj,
                                b
                              ) ||
                              'text-gray-700'
                            }`}>
                              {parseFloat(tr.avgs.sommeil).toFixed(1)}h
                            </p>
                          </div>
                        )}

                        {tr.avgs.stress != null && (
                          <div>
                            <p className="text-xs text-gray-400">
                              Stress
                            </p>
                            <p className={`text-xs font-semibold ${
                              metricColor(
                                tr.avgs.stress,
                                'stress',
                                obj,
                                b
                              ) ||
                              'text-gray-700'
                            }`}>
                              {parseFloat(tr.avgs.stress).toFixed(1)}/10
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs text-gray-400">
                            Dernier
                          </p>
                          <p className="text-xs text-gray-500">
                            {relativeDate(tr.lastDate)}
                          </p>
                        </div>

                      </div>

                    </div>

                  ) : (

                    <div className="border-t border-gray-50 pt-3">

                      <p className="text-xs text-gray-400">
                        {notOnboarded
                          ? 'Profil non encore complété'
                          : 'Aucune donnée ces 7 derniers jours'}
                      </p>

                    </div>

                  )}

                  {/* CYCLE */}

                  {a.genre === 'femme' &&
                    !a.is_self && (

                    cycle ? (

                      <div className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                        PHASE_COLOR_CLASSES[
                          cycle.phaseColor
                        ]
                      }`}>
                        <span>
                          {cycle.phaseLabel}
                        </span>

                        <span className="opacity-70">
                          · {cycle.dayLabel}
                        </span>
                      </div>

                    ) : !notOnboarded ? (

                      <p className="mt-2 text-xs text-gray-300">
                        Cycle non renseigné
                      </p>

                    ) : null

                  )}

                  {/* LIEN D'ACCÈS */}

                  {notOnboarded && (

                    <div
                      className="mt-3 border-t border-gray-50 pt-3"
                      onClick={e =>
                        e.preventDefault()
                      }
                    >

                      <button
                        onClick={e => {
                          e.preventDefault()
                          handleSendInvite(a)
                        }}
                        disabled={
                          sendingInvite === a.id
                        }
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium border border-brand-200 hover:bg-brand-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {sendingInvite === a.id
                          ? 'Génération…'
                          : '🔗 Générer le lien'}
                      </button>

                    </div>

                  )}

                </Link>

                {/* SUPPRESSION */}

                {!a.is_self && (

                  <button
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()

                      setConfirmDelete({
                        id: a.id,
                        name: a.full_name
                      })

                      setDeleteErr('')
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center shadow-sm"
                    title="Supprimer ce coaché"
                  >

                    <svg
                      className="w-3.5 h-3.5 text-gray-400 hover:text-red-500"
                      fill="none"
                      viewBox="0 0 16 16"
                    >

                      <path
                        d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 004.5 14h7a.5.5 0 00.5-.5L13 4"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

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