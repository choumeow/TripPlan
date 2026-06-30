import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

const TRIP_SELECT =
  '*, trip_members(id, user_id, display_name, role, profiles(display_name, avatar_url))'

export function useTrips() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['trips', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('trips').select(TRIP_SELECT)
      if (error) throw error
      return data
    },
  })
}
