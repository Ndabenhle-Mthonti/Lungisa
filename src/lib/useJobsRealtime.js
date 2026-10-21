import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient.js'

// Each screen refetches only the lists it shows. A prefix matches every filter variant.
const QUERY_KEYS = {
  landlord_id: [['landlord-stats'], ['landlord-jobs']],
  tenant_id: [['tenant-requests'], ['tenant-request']],
  provider_id: [['provider-jobs']],
}

// Listens for changes to this person's jobs and reloads the lists on screen.
// A dropped connection stays quiet. The Refresh button still reloads the list.
export function useJobsRealtime(filterColumn, userId) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const keys = QUERY_KEYS[filterColumn]
    if (!userId || !keys) return undefined

    // Wait past the development double-render. Subscribing and leaving
    // immediately makes the server drop the next change.
    let channel = null
    const timer = setTimeout(() => {
      channel = supabase
        .channel('jobs-' + filterColumn + '-' + userId + '-' + Date.now())
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'jobs',
            filter: filterColumn + '=eq.' + userId,
          },
          () => {
            keys.forEach((queryKey) => {
              queryClient.invalidateQueries({ queryKey })
            })
          },
        )
        .subscribe()
    }, 0)

    return () => {
      clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [filterColumn, userId, queryClient])
}
