import { Navigate } from 'react-router-dom'
import Spinner from '../components/Spinner.jsx'
import LogOutButton from '../features/auth/LogOutButton.jsx'
import { useAuth } from '../features/auth/AuthProvider.jsx'
import { useProfile } from '../features/auth/useProfile.js'
import './RoleGuard.css'

// The screen to open for each role. The role comes from the profiles table.
export const ROLE_HOME = {
  landlord: '/landlord',
  tenant: '/tenant',
  provider: '/provider',
}

export function AccountNotSetUp() {
  return (
    <main className="account-not-set-up">
      <p>Your account is not set up yet. Please contact your landlord.</p>
      <LogOutButton />
    </main>
  )
}

// This guard only sends people to the right screen.
// It is not security. Row Level Security in the database decides what a person can read.
export default function RoleGuard({ role, children }) {
  const { session, loading } = useAuth()
  const profile = useProfile()

  if (loading || (session && profile.isLoading)) {
    return (
      <main>
        <Spinner />
      </main>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (profile.isError) {
    return (
      <main className="account-not-set-up">
        <p>Could not load your profile. Please try again.</p>
        <LogOutButton />
      </main>
    )
  }

  const home = ROLE_HOME[profile.data?.role]
  if (!profile.data || !home) {
    return <AccountNotSetUp />
  }

  if (profile.data.role !== role) {
    return <Navigate to={home} replace />
  }

  return children
}
