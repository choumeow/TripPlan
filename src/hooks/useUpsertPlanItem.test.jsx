import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, eq, insert, update, from } = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const insert = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, update }))
  return { single, select, eq, insert, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpsertPlanItem } from './useUpsertPlanItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

const item = { kind: 'place', category: 'meal', title: 'Ichiran', status: 'pending' }

describe('useUpsertPlanItem', () => {
  it('inserts a new item with trip_id + created_by', async () => {
    single.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const { result } = renderHook(() => useUpsertPlanItem('t1'), { wrapper })
    result.current.mutate({ ...item, createdBy: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('plan_items')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', created_by: 'm1', title: 'Ichiran' }))
  })
  it('updates an existing item (with id), without trip_id/created_by', async () => {
    single.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const { result } = renderHook(() => useUpsertPlanItem('t1'), { wrapper })
    result.current.mutate({ ...item, id: 'p1', createdBy: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ created_by: expect.anything() }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ichiran' }))
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })
})
