import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useTogglePacked(tripId) {
  const queryClient = useQueryClient()
  const key = ['trip', tripId]
  return useMutation({
    mutationFn: async ({ id, packed }) => {
      const { error } = await supabase.rpc('set_packing_packed', { p_item_id: id, p_packed: packed })
      if (error) throw error
    },
    onMutate: async ({ id, packed }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      if (previous) {
        queryClient.setQueryData(key, {
          ...previous,
          packing_items: (previous.packing_items ?? []).map((r) => (r.id === id ? { ...r, packed } : r)),
        })
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(key, ctx.previous) },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
