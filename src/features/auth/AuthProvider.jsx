import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

const AuthContext = createContext(null)

// There is no sign-up here. Seed data and the invite function create accounts.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // True only after the person opens a password-reset email link.
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    let ignore = false

    // Subscribe first so a reset link is not missed while the session loads.
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') setPasswordRecovery(false)
      setSession(nextSession)
      setLoading(false)
    })

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (ignore) return
      setSession(sessionData.session ?? null)
      setLoading(false)
    })

    return () => {
      ignore = true
      data.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ session, loading, passwordRecovery, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
