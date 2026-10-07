import { supabase } from '../../lib/supabaseClient.js'

// The role lives on this row, not in the login token.
export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, unit_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

// Supabase sends the email. The page must not say whether the address exists.
export async function requestPasswordReset(email) {
  const redirectTo = `${window.location.origin}/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
