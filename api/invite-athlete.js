// api/invite-athlete.js
// Utilise le SDK @supabase/supabase-js avec la service role key
// pour inviter un athlète via la méthode officielle auth.admin.inviteUserByEmail

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl    = process.env.VITE_SUPABASE_URL

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante dans les variables Vercel' })
  }
  if (!supabaseUrl) {
    return res.status(500).json({ error: 'VITE_SUPABASE_URL manquante dans les variables Vercel' })
  }

  const { email, full_name, coach_id, genre, redirect_to } = req.body

  if (!email || !coach_id) {
    return res.status(400).json({ error: 'email et coach_id sont requis' })
  }

  // ── Client admin (service role — jamais exposé côté client) ─────────
  const supabaseAdmin = createClient(
    supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    }
  )

  try {
    // ── 1. Inviter l'utilisateur ─────────────────────────────────────
    const redirectTo = redirect_to ||
      `${process.env.VITE_APP_URL || ''}/onboarding`

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          full_name,
          coach_id,
          role: 'athlete',
        },
      })

    if (inviteError) {
      console.error('inviteUserByEmail error:', inviteError)

      // Messages d'erreur lisibles selon le code
      let friendlyMsg = inviteError.message
      if (inviteError.message?.includes('already been registered') ||
          inviteError.message?.includes('already registered')) {
        friendlyMsg = 'Cet email est déjà enregistré. L\'athlète peut se connecter directement.'
      } else if (inviteError.message?.includes('rate limit')) {
        friendlyMsg = 'Trop d\'invitations envoyées. Réessaie dans quelques minutes.'
      }

      return res.status(400).json({ error: friendlyMsg, detail: inviteError })
    }

    const userId = inviteData?.user?.id
    if (!userId) {
      return res.status(500).json({ error: 'Invitation envoyée mais ID utilisateur non retourné' })
    }

    // ── 2. Créer le profil en base ───────────────────────────────────
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id:        userId,
        role:      'athlete',
        full_name: full_name || email.split('@')[0],
        email,
        coach_id,
        genre:     genre || 'femme',
        is_self:   false,
      })

    if (profileError) {
      // Non bloquant si le profil existe déjà (code 23505 = unique violation)
      if (profileError.code !== '23505') {
        console.warn('Profile creation warning:', profileError)
      }
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
