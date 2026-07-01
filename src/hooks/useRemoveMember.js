import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useRemoveMember(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberId) => {
      const { error } = await supabase.rpc('remove_member', { p_member_id: memberId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
