import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useRespondInvite() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ tripId, accept }) => {
      const { error } = await supabase.rpc('respond_invite', { p_trip_id: tripId, p_accept: accept })
      if (error) throw error
    },
    onSuccess: (_data, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['trips', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
    },
  })
}
