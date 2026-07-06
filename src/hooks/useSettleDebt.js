import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useSettleDebt(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ from_member, to_member, currency, amount, createdBy }) => {
      const { error } = await supabase.from('settlements').insert({
        trip_id: tripId,
        from_member,
        to_member,
        currency,
        amount,
        created_by: createdBy ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
