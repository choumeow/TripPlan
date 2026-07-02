import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useDeletePlanItem(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('plan_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
