import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useInviteMember(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, role }) => {
      const { data, error } = await supabase.rpc('invite_member', {
        p_trip_id: tripId,
        p_email: email,
        p_role: role,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
