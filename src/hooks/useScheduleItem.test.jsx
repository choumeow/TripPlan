import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, update, from, invalidate } = vi.hoisted(() => {
  const eq = vi.fn(() => Promise.resolve({ error: null }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  const invalidate = vi.fn()
  return { eq, update, from, invalidate }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate, setQueryData: vi.fn(), getQueryData: vi.fn(), cancelQueries: vi.fn() }) }
})

import { useScheduleItem } from './useScheduleItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useScheduleItem', () => {
  it('maps a plan update to plan_items columns (date/order/status)', async () => {
    const { result } = renderHook(() => useScheduleItem('t1'), { wrapper })
    result.current.mutate([{ source: 'plan', id: 'a', patch: { scheduledDate: '2026-07-04', sortOrder: 2 } }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('plan_items')
    expect(update).toHaveBeenCalledWith({ scheduled_date: '2026-07-04', status: 'planned', sort_order: 2 })
    expect(eq).toHaveBeenCalledWith('id', 'a')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
  it('sets status pending when unscheduling a plan item', async () => {
    const { result } = renderHook(() => useScheduleItem('t1'), { wrapper })
    result.current.mutate([{ source: 'plan', id: 'a', patch: { scheduledDate: null, sortOrder: 0 } }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith({ scheduled_date: null, status: 'pending', sort_order: 0 })
  })
  it('maps a transport update to transport columns (depart_date/time/order)', async () => {
    const { result } = renderHook(() => useScheduleItem('t1'), { wrapper })
    result.current.mutate([{ source: 'transport', id: 't', patch: { scheduledDate: '2026-07-04', sortOrder: 1, startTime: '10:00' } }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('transport')
    expect(update).toHaveBeenCalledWith({ depart_date: '2026-07-04', sort_order: 1, depart_time: '10:00' })
  })
})
