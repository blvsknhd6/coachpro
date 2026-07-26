import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl    = process.env.VITE_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Variables d\'environnement manquantes' })
  }

  const { email, full_name, coach_id, genre } = req.body

  if (!email || !coach_id) {
    return res.status(400).json({ error: 'email et coach_id sont requis' })
  }

  const supabaseAdmin = createClient(
    supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    // Crée le compte sans envoyer d'email — mot de passe aléatoire temporaire
    // L'athlète devra passer par le lien d'invitation quand il sera envoyé plus tard
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!1'

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password:      tempPassword,
      email_confirm: true, // compte actif immédiatement côté auth, mais l'athlète n'a pas le mot de passe
    })

    if (createError) {
      let msg = createError.message
      if (msg?.includes('already been registered') || msg?.includes('already registered')) {
        msg = 'Cet email est déjà enregistré.'
      }
      return res.status(400).json({ error: msg })
    }

    const userId = userData.user.id

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id:        userId,
      role:      'athlete',
      full_name: full_name || email.split('@')[0],
      email,
      coach_id,
      genre:   genre || 'femme',
      is_self: false,
    })

    if (profileError && profileError.code !== '23505') {
      console.warn('Profile creation warning:', profileError)
    }

    return res.status(200).json({
      success: true,
      user_id: userId,
      email,
      message: `Profil créé pour ${email}. L'invitation peut être envoyée plus tard.`,
    })

  } catch (error) {
    console.error('create-athlete error:', error)
    return res.status(500).json({ error: error.message })
  }
}