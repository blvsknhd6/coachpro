import { supabase } from './supabase'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function createAthleteAccount(email, password, fullName, coachId) {
  // Le coach crée le compte de son athlète
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error

  await supabase.from('profiles').insert({
    id: data.user.id,
    role: 'athlete',
    full_name: fullName,
    email,
    coach_id: coachId,
  })

  return data.user
}
