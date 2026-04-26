// api/delete-athlete.js
// Supprime un athlète côté Supabase Auth + profil en cascade.
// Nécessite la service role key — jamais exposée côté client.

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

  const { athlete_id, coach_id } = req.body

  if (!athlete_id || !coach_id) {
    return res.status(400).json({ error: 'athlete_id et coach_id sont requis' })
  }

  const supabaseAdmin = createClient(
    supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    // 1. Vérifier que l'athlète appartient bien à ce coach (sécurité)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, coach_id, is_self')
      .eq('id', athlete_id)
      .single()

    if (profileErr || !profile) {
      return res.status(404).json({ error: 'Athlète introuvable' })
    }
    if (profile.coach_id !== coach_id) {
      return res.status(403).json({ error: 'Non autorisé : cet athlète n\'appartient pas à ce coach' })
    }
    if (profile.is_self) {
      return res.status(400).json({ error: 'Impossible de supprimer ton propre profil athlète' })
    }

    // 2. Supprimer le profil (cascade supprime blocs, séances, séries, tracking…)
    const { error: deleteProfileErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', athlete_id)

    if (deleteProfileErr) {
      console.error('Delete profile error:', deleteProfileErr)
      return res.status(500).json({ error: 'Erreur lors de la suppression du profil' })
    }

    // 3. Supprimer l'utilisateur Supabase Auth
    const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(athlete_id)

    if (deleteAuthErr) {
      // Non bloquant : le profil est déjà supprimé
      console.warn('Delete auth user warning:', deleteAuthErr)
    }

    return res.status(200).json({ success: true, message: 'Athlète supprimé' })

  } catch (error) {
    console.error('delete-athlete error:', error)
    return res.status(500).json({ error: error.message })
  }
}
