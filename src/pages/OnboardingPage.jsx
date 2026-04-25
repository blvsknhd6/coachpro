// src/pages/OnboardingPage.jsx
// Page de complétion du profil pour les athlètes invités via email.
// Supabase redirige ici avec un token dans l'URL après clic sur le lien d'invitation.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function OnboardingPage() {
  const navigate = useNavigate()

  const [step, setStep]       = useState('loading') // loading | form | done | error
  const [session, setSession] = useState(null)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  const [form, setForm] = useState({
    full_name:           '',
    genre:               'femme',
    date_naissance:      '',
    taille:              '',
    poids:               '',
    pas_journaliers_moy: '',
    seances_semaine:     '',
    password:            '',
    password2:           '',
  })

  useEffect(() => {
    // Supabase intercepte automatiquement le token dans l'URL hash (#access_token=...)
    // et crée une session. On écoute le changement.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === 'SIGNED_IN' && sess) {
        setSession(sess)

        // Pré-remplir le nom si disponible dans les métadonnées
        const meta = sess.user?.user_metadata || {}
        setForm(f => ({
          ...f,
          full_name: meta.full_name || '',
        }))

        setStep('form')
      } else if (event === 'USER_UPDATED') {
        // Mot de passe mis à jour avec succès
      }
    })

    // Timeout : si après 5s pas de session, afficher erreur
    const timeout = setTimeout(() => {
      setStep(s => s === 'loading' ? 'error' : s)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit() {
    setError('')

    if (!form.full_name.trim())           return setError('Le prénom et nom sont requis.')
    if (!form.date_naissance)             return setError('La date de naissance est requise.')
    if (!form.taille)                     return setError('La taille est requise.')
    if (!form.pas_journaliers_moy)        return setError('Les pas journaliers sont requis.')
    if (!form.seances_semaine)            return setError('Le nombre de séances par semaine est requis.')
    if (!form.password)                   return setError('Le mot de passe est requis.')
    if (form.password.length < 8)        return setError('Le mot de passe doit faire au moins 8 caractères.')
    if (form.password !== form.password2) return setError('Les mots de passe ne correspondent pas.')

    setSaving(true)

    try {
      // 1. Mettre à jour le mot de passe
      const { error: pwErr } = await supabase.auth.updateUser({
        password: form.password,
      })
      if (pwErr) throw pwErr

      // 2. Mettre à jour le profil
      const { error: profileErr } = await supabase.from('profiles').update({
        full_name:      form.full_name.trim(),
        genre:          form.genre,
        date_naissance: form.date_naissance,
        taille:         form.taille ? Number(form.taille) : null,
      }).eq('id', session.user.id)
      if (profileErr) throw profileErr

      // 3. Poids de départ + données d'activité initiales
      const { data: blocs } = await supabase.from('blocs')
        .select('id').eq('athlete_id', session.user.id).order('created_at', { ascending: false }).limit(1)

      const today = new Date().toISOString().split('T')[0]

      if (blocs?.[0]) {
        const blocId = blocs[0].id

        await Promise.all([
          // Poids de départ sur le bloc
          form.poids
            ? supabase.from('blocs').update({ poids_depart: Number(form.poids) }).eq('id', blocId)
            : null,

          // Entrée data_tracking avec poids + pas du jour
          supabase.from('data_tracking').upsert({
            athlete_id:      session.user.id,
            bloc_id:         blocId,
            date:            today,
            poids:           form.poids           ? Number(form.poids)                        : null,
            pas_journaliers: form.pas_journaliers_moy ? Number(form.pas_journaliers_moy) : null,
          }, { onConflict: 'athlete_id,date' }),

          // Objectifs du bloc : séances/semaine + pas journaliers comme objectif de référence
          supabase.from('objectifs_bloc').upsert({
            bloc_id:             blocId,
            seances_par_semaine: form.seances_semaine     ? Number(form.seances_semaine)     : null,
            pas_journaliers:     form.pas_journaliers_moy ? Number(form.pas_journaliers_moy) : null,
          }, { onConflict: 'bloc_id' }),
        ].filter(Boolean))
      }

      setStep('done')
      setTimeout(() => navigate('/athlete'), 2000)

    } catch (e) {
      setError(e.message || 'Une erreur est survenue.')
    }

    setSaving(false)
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Validation de votre invitation…</p>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
          <p className="text-2xl mb-3">⚠️</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Lien invalide ou expiré</h1>
          <p className="text-sm text-gray-500 mb-5">
            Le lien d'invitation a peut-être expiré (valable 24h). Demande à ton coach de t'en envoyer un nouveau.
          </p>
          <button onClick={() => navigate('/login')}
            className="text-sm text-brand-600 font-medium hover:text-brand-800">
            Retour à la connexion →
          </button>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
          <p className="text-4xl mb-3">🎉</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Profil complété !</h1>
          <p className="text-sm text-gray-500">Redirection vers ton espace…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Bienvenue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complète ton profil pour accéder à ton espace.
          </p>
        </div>

        <div className="space-y-4">

          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom et nom</label>
            <input
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Marie Dupont"
            />
          </div>

          {/* Genre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Genre</label>
            <div className="flex gap-2">
              {['femme', 'homme'].map(g => (
                <button key={g} type="button"
                  onClick={() => setForm(f => ({ ...f, genre: g }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.genre === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'}`}>
                  {g === 'femme' ? 'Femme' : 'Homme'}
                </button>
              ))}
            </div>
          </div>

          {/* Date de naissance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
            <input
              type="date"
              value={form.date_naissance}
              onChange={e => setForm(f => ({ ...f, date_naissance: e.target.value }))}
              max={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Taille + Poids */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taille</label>
              <div className="flex items-center gap-1">
                <input type="number" value={form.taille}
                  onChange={e => setForm(f => ({ ...f, taille: e.target.value }))}
                  placeholder="165"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">cm</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Poids actuel</label>
              <div className="flex items-center gap-1">
                <input type="number" step="0.1" value={form.poids}
                  onChange={e => setForm(f => ({ ...f, poids: e.target.value }))}
                  placeholder="60"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">kg</span>
              </div>
            </div>
          </div>

          {/* Activité */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-700">Niveau d'activité</p>
            <p className="text-xs text-blue-500">Ces infos permettront à ton coach de calculer tes besoins caloriques.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Moyenne de pas journaliers (sur le dernier mois)
              </label>
              <div className="flex items-center gap-2">
                <input type="number" value={form.pas_journaliers_moy}
                  onChange={e => setForm(f => ({ ...f, pas_journaliers_moy: e.target.value }))}
                  placeholder="7500"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">pas/jour</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Consulte ton téléphone ou ta montre connectée pour estimer.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de séances sportives souhaitées par semaine
              </label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button key={n} type="button"
                    onClick={() => setForm(f => ({ ...f, seances_semaine: String(n) }))}
                    className={`w-10 h-10 rounded-lg text-sm font-medium border transition-colors ${form.seances_semaine === String(n) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mot de passe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Créer un mot de passe</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="8 caractères minimum"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
            <input
              type="password"
              value={form.password2}
              onChange={e => setForm(f => ({ ...f, password2: e.target.value }))}
              placeholder="Répète ton mot de passe"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {saving ? 'Enregistrement…' : 'Accéder à mon espace →'}
          </button>
        </div>
      </div>
    </div>
  )
}
