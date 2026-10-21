import { supabase } from '../../lib/supabaseClient.js'

// Jobs assigned to the signed-in provider that are not finished yet.
export async function fetchProviderJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, category, description, status, is_urgent')
    .neq('status', 'done')
    .order('created_at', { ascending: false })

  if (error) throw new Error('Jobs could not be loaded. Please try again.')

  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    description: row.description ?? '',
    status: row.status,
    urgent: row.is_urgent === true,
  }))
}
