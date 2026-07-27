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

  // Construire l'URL complète depuis les headers de la requête Vercel
  // (évite le problème de l'URL relative que Supabase refuse)
  const proto      = req.headers['x-forwarded-proto'] || 'https'
  const host       = req.headers['x-forwarded-host'] || req.headers.host || ''
  const baseUrl    = host ? `${proto}://${host}` : (process.env.VITE_APP_URL || '')
  const redirectTo = redirect_to || `${baseUrl}/onboarding`

  try {
    // Vérifie si un compte Auth existe déjà pour cet email
    // (cas : créé via create-athlete sans invitation)
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError

    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      // Le compte existe déjà — on génère un lien magique (type invite)
      // qui connecte directement l'athlète et le redirige vers /onboarding
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type:    'magiclink',
        email,
        options: { redirectTo },
      })

      if (linkError) {
        console.error('generateLink error:', linkError)
        return res.status(400).json({ error: linkError.message })
      }

      // generateLink retourne le lien mais n'envoie pas d'email —
      // on utilise l'API email de Supabase pour l'envoyer via le template "Magic Link"
      const emailRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${existingUser.id}/send-email`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ email_action_link: linkData.properties?.action_link }),
      })

      // Fallback : si l'envoi via l'API interne échoue, on tente resetPasswordForEmail
      // avec l'URL absolue qu'on vient de construire
      if (!emailRes.ok) {
        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo })
        if (resetError) {
          console.error('resetPasswordForEmail error:', resetError)
          return res.status(400).json({ error: `Impossible d'envoyer l'email : ${resetError.message}` })
        }
      }

      return res.status(200).json({
        success: true,
        user_id: existingUser.id,
        email,
        message: `Lien d'accès envoyé à ${email}`,
      })
    }

    // Nouvel utilisateur — invitation standard
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name, coach_id, role: 'athlete' },
      })

    if (inviteError) {
      let msg = inviteError.message
      if (msg?.includes('rate limit')) msg = 'Trop d\'invitations envoyées. Réessaie dans quelques minutes.'
      return res.status(400).json({ error: msg })
    }

    const userId = inviteData?.user?.id
    if (!userId) return res.status(500).json({ error: 'Invitation envoyée mais ID utilisateur non retourné' })

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