import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed'
    })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!serviceRoleKey) {
    return res.status(500).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY manquante'
    })
  }

  if (!supabaseUrl) {
    return res.status(500).json({
      error: 'VITE_SUPABASE_URL manquante'
    })
  }

  const {
    email,
    full_name,
    coach_id,
    genre,
    redirect_to
  } = req.body || {}

  if (!email || !coach_id) {
    return res.status(400).json({
      error: 'email et coach_id sont requis'
    })
  }

  const cleanEmail = email.trim().toLowerCase()
  const cleanUrl = supabaseUrl.replace(/\/$/, '')

  const supabaseAdmin = createClient(
    cleanUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  // URL vers laquelle l'athlète sera envoyé après avoir utilisé le lien
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host =
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''

  const baseUrl = host
    ? `${proto}://${host}`
    : (process.env.VITE_APP_URL || '')

  const redirectTo =
    redirect_to ||
    `${baseUrl}/onboarding`

  try {
    /*
     * ============================================================
     * 1. CHERCHER SI L'UTILISATEUR EXISTE DÉJÀ
     * ============================================================
     */

    let existingUser = null
    let page = 1
    const perPage = 1000

    while (!existingUser) {
      const {
        data,
        error
      } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      })

      if (error) {
        throw error
      }

      const users = data?.users || []

      existingUser = users.find(
        user =>
          user.email?.trim().toLowerCase() === cleanEmail
      )

      if (
        users.length < perPage ||
        !data?.nextPage
      ) {
        break
      }

      page++
    }

    /*
     * ============================================================
     * 2. UTILISATEUR EXISTANT
     * ============================================================
     *
     * On génère simplement un nouveau lien magique.
     * AUCUN EMAIL N'EST ENVOYÉ.
     */

    if (existingUser) {
      const {
        data: linkData,
        error: linkError
      } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: cleanEmail,
        options: {
          redirectTo
        }
      })

      if (linkError) {
        console.error(
          'generateLink error:',
          linkError
        )

        return res.status(400).json({
          error: linkError.message
        })
      }

      const actionLink =
        linkData?.properties?.action_link

      if (!actionLink) {
        return res.status(500).json({
          error: 'Impossible de générer le lien d’accès'
        })
      }

      return res.status(200).json({
        success: true,
        user_id: existingUser.id,
        email: cleanEmail,
        action_link: actionLink,
        existing_user: true,
        message:
          `Lien d'accès généré : ${actionLink}`
      })
    }

    /*
     * ============================================================
     * 3. NOUVEL UTILISATEUR
     * ============================================================
     *
     * On crée directement le compte sans envoyer d'email.
     */

    const {
      data: createData,
      error: createError
    } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,

      // Le compte est considéré comme confirmé puisque
      // l'accès sera donné manuellement via le magic link.
      email_confirm: true,

      user_metadata: {
        full_name,
        coach_id,
        role: 'athlete'
      }
    })

    if (createError) {
      console.error(
        'createUser error:',
        createError
      )

      return res.status(400).json({
        error: createError.message
      })
    }

    const userId = createData?.user?.id

    if (!userId) {
      return res.status(500).json({
        error: 'Utilisateur créé mais ID non retourné'
      })
    }

    /*
     * ============================================================
     * 4. CRÉER LE PROFIL
     * ============================================================
     */

    const {
      error: profileError
    } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        role: 'athlete',
        full_name:
          full_name ||
          cleanEmail.split('@')[0],
        email: cleanEmail,
        coach_id,
        genre: genre || 'femme',
        is_self: false
      })

    if (
      profileError &&
      profileError.code !== '23505'
    ) {
      console.warn(
        'Profile creation warning:',
        profileError
      )
    }

    /*
     * ============================================================
     * 5. GÉNÉRER LE LIEN D'ACCÈS
     * ============================================================
     */

    const {
      data: linkData,
      error: linkError
    } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
      options: {
        redirectTo
      }
    })

    if (linkError) {
      console.error(
        'generateLink error:',
        linkError
      )

      return res.status(400).json({
        error:
          `Compte créé mais impossible de générer le lien : ${linkError.message}`,
        user_id: userId
      })
    }

    const actionLink =
      linkData?.properties?.action_link

    if (!actionLink) {
      return res.status(500).json({
        error:
          'Compte créé mais aucun lien d’accès n’a été généré',
        user_id: userId
      })
    }

    /*
     * ============================================================
     * 6. RETOURNER LE LIEN
     * ============================================================
     *
     * Aucun email n'est envoyé.
     * Le coach peut copier le lien et l'envoyer lui-même.
     */

    return res.status(200).json({
      success: true,
      user_id: userId,
      email: cleanEmail,
      action_link: actionLink,
      existing_user: false,
      message:
        `Lien d'accès généré : ${actionLink}`
    })

  } catch (error) {
    console.error(
      'invite-athlete unexpected error:',
      error
    )

    return res.status(500).json({
      error:
        error?.message ||
        'Erreur serveur lors de la création de l’athlète'
    })
  }
}