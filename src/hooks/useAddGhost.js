import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useAddGhost(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name) => {
      const { data, error } = await supabase.rpc('add_ghost', { p_trip_id: tripId, p_name: name })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
