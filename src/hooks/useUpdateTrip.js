import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpdateTrip(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, place, startDate, endDate }) => {
      const { data, error } = await supabase
        .from('trips')
        .update({ name, place, start_date: startDate, end_date: endDate })
        .eq('id', tripId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
