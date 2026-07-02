import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Map a source-agnostic patch to the columns of its table. Only include provided keys.
function planColumns(patch) {
  const row = {}
  if ('scheduledDate' in patch) { row.scheduled_date = patch.scheduledDate; row.status = patch.scheduledDate ? 'planned' : 'pending' }
  if ('sortOrder' in patch) row.sort_order = patch.sortOrder
  if ('startTime' in patch) row.start_time = patch.startTime
  if ('durationMin' in patch) row.duration_min = patch.durationMin
  return row
}
function transportColumns(patch) {
  const row = {}
  if ('scheduledDate' in patch) row.depart_date = patch.scheduledDate
  if ('sortOrder' in patch) row.sort_order = patch.sortOrder
  if ('startTime' in patch) row.depart_time = patch.startTime
  return row
}

export function useScheduleItem(tripId) {
  const queryClient = useQueryClient()
  const key = ['trip', tripId]
  return useMutation({
    mutationFn: async (updates) => {
      for (const u of updates) {
        const table = u.source === 'transport' ? 'transport' : 'plan_items'
        const columns = u.source === 'transport' ? transportColumns(u.patch) : planColumns(u.patch)
        const { error } = await supabase.from(table).update(columns).eq('id', u.id)
        if (error) throw error
      }
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      if (previous) queryClient.setQueryData(key, applyOptimistic(previous, updates))
      return { previous }
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(key, ctx.previous) },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

// Patch the cached trip so the drag looks instant before the write returns.
function applyOptimistic(trip, updates) {
  const patchRow = (row, cols) => ({ ...row, ...cols })
  const planUpd = new Map(updates.filter((u) => u.source === 'plan').map((u) => [u.id, planColumns(u.patch)]))
  const trUpd = new Map(updates.filter((u) => u.source === 'transport').map((u) => [u.id, transportColumns(u.patch)]))
  return {
    ...trip,
    plan_items: (trip.plan_items ?? []).map((r) => (planUpd.has(r.id) ? patchRow(r, planUpd.get(r.id)) : r)),
    transport: (trip.transport ?? []).map((r) => (trUpd.has(r.id) ? patchRow(r, trUpd.get(r.id)) : r)),
  }
}
