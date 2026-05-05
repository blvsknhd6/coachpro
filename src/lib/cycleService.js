import { supabase } from './supabase'

export async function fetchPeriodLogs(userId) {
  const { data, error } = await supabase
    .from('period_logs')
    .select('*')
    .eq('user_id', userId)
    .order('period_start_date', { ascending: false })
    .limit(10)
  return { data: data || [], error }
}

export async function upsertPeriodLog(userId, { period_start_date, period_duration_days }) {
  return supabase.from('period_logs').upsert(
    { user_id: userId, period_start_date, period_duration_days },
    { onConflict: 'user_id,period_start_date' }
  )
}

export async function deletePeriodLog(id) {
  return supabase.from('period_logs').delete().eq('id', id)
}