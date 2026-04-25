// api/invite-athlete.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl    = process.env.VITE_SUPABASE_URL

  // ── Vérification des variables d'environnement ──────────────────────
  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante dans les variables d\'environnement Vercel' })
  }
  if (!supabaseUrl) {
    return res.status(500).json({ error: 'VITE_SUPABASE_URL manquante dans les variables d\'environnement Vercel' })
  }

  const { email, full_name, coach_id, genre, redirect_to } = req.body

  if (!email || !coach_id) {
    return res.status(400).json({ error: 'email et coach_id sont requis' })
  }

  // ── Nettoyage de l'URL Supabase (pas de slash final) ────────────────
  const baseUrl = supabaseUrl.replace(/\/$/, '')
  const inviteUrl = `${baseUrl}/auth/v1/admin/invite`

  try {
    const inviteRes = await fetch(inviteUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        email,
        data: { full_name, coach_id, role: 'athlete' },
        redirect_to: redirect_to || `${process.env.VITE_APP_URL || ''}/onboarding`,
      }),
    })

    // ── Parse robuste ────────────────────────────────────────────────
    const rawText = await inviteRes.text()
    let inviteData
    try {
      inviteData = JSON.parse(rawText)
    } catch {
      // Supabase a renvoyé du HTML ou autre chose — on expose le détail
      console.error('Supabase non-JSON response:', rawText.slice(0, 500))
      return res.status(502).json({
        error: `Réponse inattendue de Supabase (HTTP ${inviteRes.status})`,
        // On expose les 200 premiers caractères pour aider au debug
        hint: rawText.slice(0, 200),
        inviteUrl,
        // Ne jamais logger la service role key complète, juste les 8 premiers caractères
        keyPrefix: serviceRoleKey.slice(0, 8) + '...',
      })
    }

    if (!inviteRes.ok) {
      // Cas fréquents :
      // - "User already registered" → email déjà utilisé
      // - "Email rate limit exceeded" → trop d'invitations
      const msg =
        inviteData?.msg ||
        inviteData?.message ||
        inviteData?.error_description ||
        inviteData?.error ||
        `Erreur Supabase (HTTP ${inviteRes.status})`

      console.error('Supabase invite error:', inviteData)
      return res.status(400).json({ error: msg, detail: inviteData })
    }

    // ── Création du profil ───────────────────────────────────────────
    const profileRes = await fetch(`${baseUrl}/rest/v1/profiles`, {
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
        genre:     genre || 'femme',
        is_self:   false,
      }),
    })

    if (!profileRes.ok) {
      const profileText = await profileRes.text()
      // Non bloquant : le profil existe peut-être déjà
      console.warn('Profile creation warning:', profileText.slice(0, 200))
    }

    return res.status(200).json({
      success: true,
      user_id: inviteData.id,
      email,
      message: `Invitation envoyée à ${email}`,
    })

  } catch (error) {
    console.error('invite-athlete unexpected error:', error)
    return res.status(500).json({ error: error.message })
  }
}