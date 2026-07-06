import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertCategory(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, budgets, createdBy }) => {
      let categoryId = id
      if (id) {
        const { error } = await supabase.from('budget_categories').update({ name }).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('budget_categories')
          .insert({ trip_id: tripId, name, created_by: createdBy ?? null })
          .select()
          .single()
        if (error) throw error
        categoryId = data.id
      }
      for (const [currency, amount] of Object.entries(budgets ?? {})) {
        if (amount === '' || amount == null) {
          const { error } = await supabase.from('category_budgets').delete().eq('category_id', categoryId).eq('currency', currency)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('category_budgets')
            .upsert({ category_id: categoryId, currency, amount: Number(amount) }, { onConflict: 'category_id,currency' })
          if (error) throw error
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
