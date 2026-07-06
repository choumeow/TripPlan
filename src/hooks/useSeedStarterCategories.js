import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { STARTER_CATEGORIES } from '../lib/budget'

export function useSeedStarterCategories(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ createdBy, existingNames = [] } = {}) => {
      const rows = STARTER_CATEGORIES
        .filter((name) => !existingNames.includes(name))
        .map((name) => ({ trip_id: tripId, name, created_by: createdBy ?? null }))
      if (!rows.length) return
      const { error } = await supabase.from('budget_categories').insert(rows)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
