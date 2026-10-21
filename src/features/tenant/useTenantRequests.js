import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider.jsx'
import { fetchTenantRequests } from './api.js'

// The signed-in tenant's requests, 20 at a time, newest first.
export function useTenantRequests() {
  const { session } = useAuth()
  const tenantId = session?.user?.id

  return useInfiniteQuery({
    queryKey: ['tenant-requests', tenantId],
    enabled: Boolean(tenantId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchTenantRequests(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
