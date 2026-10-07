import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

// The caller's still-pending trip invites, newest first. Read through an RPC because RLS
// hides a pending membership (and its trip) from the invitee until they accept.
export function usePendingInvites() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['invites', user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_pending_invites')
      if (error) throw error
      return data
    },
  })
  return { ...query, invites: query.data ?? [] }
}
