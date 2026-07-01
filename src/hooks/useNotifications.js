import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

// RLS limits rows to recipient = auth.uid(); no explicit filter needed.
export function useNotifications() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const items = query.data ?? []
  const unreadCount = items.filter((n) => !n.read_at).length
  return { ...query, items, unreadCount }
}
