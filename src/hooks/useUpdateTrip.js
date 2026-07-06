import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpdateTrip(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, place, startDate, endDate, departure_currency, destination_currency }) => {
      const { data, error } = await supabase
        .from('trips')
        .update({
          name,
          place,
          start_date: startDate,
          end_date: endDate,
          ...(departure_currency !== undefined && { departure_currency }),
          ...(destination_currency !== undefined && { destination_currency }),
        })
        .eq('id', tripId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
