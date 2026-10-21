import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider.jsx'
import { fetchLandlordJobs } from './api.js'

// The signed-in landlord's jobs, 20 at a time. Pending first, then newest.
export function useLandlordJobs({ status, unit, urgentOnly }) {
  const { session } = useAuth()
  const landlordId = session?.user?.id

  return useInfiniteQuery({
    queryKey: ['landlord-jobs', landlordId, status || 'all', unit, urgentOnly ? 'urgent' : 'any'],
    enabled: Boolean(landlordId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchLandlordJobs({ cursor: pageParam, status, unit, urgentOnly }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
