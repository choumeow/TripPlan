import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertExpense(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      if (input.scope === 'team') {
        const { error } = await supabase.rpc('record_expense', {
          p_expense_id: input.id ?? null,
          p_trip_id: tripId,
          p_description: input.description,
          p_currency: input.currency,
          p_total: input.total_amount,
          p_paid_by: input.paid_by,
          p_category_id: input.category_id ?? null,
          p_spent_on: input.spent_on ?? null,
          p_receipt_url: input.receipt_url ?? null,
          p_splits: input.splits,
        })
        if (error) throw error
        return
      }
      const { id, ...fields } = input
      const query = id
        ? supabase.from('expenses').update(fields).eq('id', id)
        : supabase.from('expenses').insert({ ...fields, trip_id: tripId })
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
