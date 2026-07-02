import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertPlanItem(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item) => {
      const { id, createdBy, ...fields } = item
      const query = id
        ? supabase.from('plan_items').update(fields).eq('id', id)
        : supabase.from('plan_items').insert({ ...fields, trip_id: tripId, created_by: createdBy ?? null })
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
