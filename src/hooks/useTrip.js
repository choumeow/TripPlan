import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

const TRIP_SELECT =
  '*, trip_members(id, user_id, display_name, role, profiles(display_name, avatar_url)), transport(*)'

export function useTrip(tripId) {
  return useQuery({
    queryKey: ['trip', tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select(TRIP_SELECT)
        .eq('id', tripId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
