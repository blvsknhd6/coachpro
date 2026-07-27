import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl    = process.env.VITE_SUPABASE_URL

  if (!serviceRoleKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' })
  if (!supabaseUrl)    return res.status(500).json({ error: 'VITE_SUPABASE_URL manquante' })

  const { email, full_name, coach_id, genre, redirect_to } = req.body

  if (!email || !coach_id) {
    return res.status(400).json({ error: 'email et coach_id sont requis' })
  }

  const supabaseAdmin = createClient(
    supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const redirectTo = redirect_to || `${process.env.VITE_APP_URL || ''}/onboarding`

  try {
    // ── Cas 1 : utilisateur déjà créé (via create-athlete) ──────────
    // On lui envoie un lien de définition de mot de passe plutôt qu'une invitation
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = (existingUsers?.users || []).find(u => u.email === email)

    if (existingUser) {
      // generateLink type 'recovery' envoie un lien "définir mon mot de passe"
      // qui redirige vers /onboarding après confirmation — même UX que l'invitation
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type:       'recovery',
        email,
        options:    { redirectTo },
      })

      if (linkError) {
        console.error('generateLink error:', linkError)
        return res.status(400).json({ error: linkError.message })
      }

      // Envoyer l'email manuellement via l'API Supabase
      // (generateLink retourne le lien mais n'envoie pas d'email en mode admin)
      // On utilise plutôt resetPasswordForEmail qui envoie l'email directement
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (resetError) {
        console.error('resetPasswordForEmail error:', resetError)
        return res.status(400).json({ error: resetError.message })
      }

      return res.status(200).json({
        success: true,
        user_id: existingUser.id,
        email,
        message: `Lien d'invitation envoyé à ${email}`,
      })
    }

    // ── Cas 2 : nouvel utilisateur — invitation standard ─────────────
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name, coach_id, role: 'athlete' },
      })

    if (inviteError) {
      console.error('inviteUserByEmail error:', inviteError)
      let friendlyMsg = inviteError.message
      if (inviteError.message?.includes('rate limit')) {
        friendlyMsg = 'Trop d\'invitations envoyées. Réessaie dans quelques minutes.'
      }
      return res.status(400).json({ error: friendlyMsg, detail: inviteError })
    }

    const userId = inviteData?.user?.id
    if (!userId) {
      return res.status(500).json({ error: 'Invitation envoyée mais ID utilisateur non retourné' })
    }

    // Créer le profil si pas encore fait
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id:        userId,
      role:      'athlete',
      full_name: full_name || email.split('@')[0],
      email,
      coach_id,
      genre:     genre || 'femme',
      is_self:   false,
    })

    if (profileError && profileError.code !== '23505') {
      console.warn('Profile creation warning:', profileError)
    }

    return res.status(200).json({
      success: true,
      user_id: userId,
      email,
      message: `Invitation envoyée à ${email}`,
    })

  } catch (error) {
    console.error('invite-athlete unexpected error:', error)
    return res.status(500).json({ error: error.message })
  }
}