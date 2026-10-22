import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Invite and reset links must open the password page before any screen uses the session.
// This runs before the client reads the link, so the tokens stay in the address.
export const leavingForPasswordPage = redirectPasswordLink()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: !leavingForPasswordPage,
  },
})

function redirectPasswordLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const linkType = hash.get('type') || search.get('type')
  const fromEmail = linkType === 'invite' || linkType === 'recovery'
  if (!fromEmail || window.location.pathname === '/reset-password') return false
  window.location.replace('/reset-password' + window.location.search + window.location.hash)
  return true
}
