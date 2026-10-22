import { supabase } from '../../lib/supabaseClient.js'

// The role lives on this row, not in the login token.
export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, unit_id, privacy_accepted_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

// Records that this person has read the privacy notice. Only their own row can change.
export async function acceptPrivacy() {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) throw new Error('Please sign in again.')

  const { data, error } = await supabase
    .from('profiles')
    .update({ privacy_accepted_at: new Date().toISOString() })
    .eq('id', userId)
    .select('privacy_accepted_at')
    .maybeSingle()

  if (error || !data?.privacy_accepted_at) {
    throw new Error('The notice could not be saved. Please try again.')
  }
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
