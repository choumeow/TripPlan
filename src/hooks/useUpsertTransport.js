import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertTransport(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (leg) => {
      const row = {
        trip_id: tripId,
        category: 'journey',
        direction: leg.direction,
        method: leg.method,
        depart_date: leg.departDate || null,
        depart_time: leg.departTime || null,
        from_text: leg.from,
        to_text: leg.to,
        reference: leg.reference || null,
      }
      const query = leg.id
        ? supabase.from('transport').update(row).eq('id', leg.id)
        : supabase.from('transport').insert({ ...row, created_by: leg.createdBy ?? null })
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
