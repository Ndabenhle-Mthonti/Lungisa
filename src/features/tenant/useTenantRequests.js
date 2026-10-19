import { useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { fetchTenantRequests } from './api.js'

// The signed-in tenant's requests, 20 at a time, newest first.
// A live change to one of their jobs reloads the list, including "Provider is on the way".
export function useTenantRequests() {
  const { session } = useAuth()
  const tenantId = session?.user?.id
  const queryClient = useQueryClient()

  const requests = useInfiniteQuery({
    queryKey: ['tenant-requests', tenantId],
    enabled: Boolean(tenantId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchTenantRequests(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  useEffect(() => {
    if (!tenantId) return undefined

    const channel = supabase
      .channel('tenant-jobs-' + tenantId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: 'tenant_id=eq.' + tenantId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-requests', tenantId] })
          queryClient.invalidateQueries({ queryKey: ['tenant-request'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])

  return requests
}
