import { useQuery } from '@tanstack/react-query'
import { fetchProfile } from './api.js'
import { useAuth } from './AuthProvider.jsx'

// Loads the profiles row for whoever is logged in.
// The query waits until a session exists, so a logged-out visit does not hit the table.
export function useProfile() {
  const { session } = useAuth()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchProfile(userId),
  })
}
