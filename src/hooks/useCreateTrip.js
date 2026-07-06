import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useCreateTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ name, place, startDate, endDate, departureCurrency, destinationCurrency }) => {
      const { data, error } = await supabase.rpc('create_trip', {
        p_name: name,
        p_place: place,
        p_start: startDate,
        p_end: endDate,
        p_departure_currency: departureCurrency,
        p_destination_currency: destinationCurrency,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips', user?.id] }),
  })
}
