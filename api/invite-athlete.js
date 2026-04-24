// api/invite-athlete.js
// Envoie un lien d'invitation Supabase à un nouvel athlète.
// Utilise la service role key (jamais exposée côté client).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl    = process.env.VITE_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Variables d\'environnement manquantes (SUPABASE_SERVICE_ROLE_KEY)' })
  }

  const { email, full_name, coach_id, redirect_to } = req.body

  if (!email || !coach_id) {
    return res.status(400).json({ error: 'email et coach_id sont requis' })
  }

  try {
    // 1. Inviter l'utilisateur via l'API admin Supabase
    //    Supabase envoie un email avec un lien magique qui pointe vers redirect_to
    const inviteRes = await fetch(`${supabaseUrl}/auth/v1/admin/invite`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        email,
        data: {
          // Ces données seront accessibles dans raw_user_meta_data
          full_name,
          coach_id,
          role: 'athlete',
        },
        redirect_to: redirect_to || `${process.env.VITE_APP_URL || ''}/onboarding`,
      }),
    })

    const inviteData = await inviteRes.json()

    if (!inviteRes.ok) {
      // Si l'utilisateur existe déjà, Supabase renvoie une erreur
      return res.status(400).json({
        error: inviteData.message || inviteData.error || 'Erreur lors de l\'invitation',
        detail: inviteData,
      })
    }

    // 2. Créer le profil en base avec les infos de base
    //    L'athlète complétera le reste lors de l'onboarding
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({
        id:        inviteData.id,
        role:      'athlete',
        full_name: full_name || email.split('@')[0],
        email,
        coach_id,
        is_self:   false,
      }),
    })

    if (!profileRes.ok) {
      const profileErr = await profileRes.json()
      // Le profil existe peut-être déjà — pas bloquant
      console.warn('Profil déjà existant ou erreur:', profileErr)
    }

    return res.status(200).json({
      success: true,
      user_id: inviteData.id,
      email,
      message: `Invitation envoyée à ${email}`,
    })

  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
