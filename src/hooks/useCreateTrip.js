import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useCreateTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ name, place, startDate, endDate }) => {
      const { data, error } = await supabase.rpc('create_trip', {
        p_name: name,
        p_place: place,
        p_start: startDate,
        p_end: endDate,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips', user?.id] }),
  })
}
