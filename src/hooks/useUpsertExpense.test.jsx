import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, insert, from } = vi.hoisted(() => {
  const rpc = vi.fn()
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { rpc, insert, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc, from } }))

import { useUpsertExpense } from './useUpsertExpense'
function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useUpsertExpense', () => {
  it('records a team expense via the RPC with mapped params', async () => {
    rpc.mockResolvedValue({ data: 'e1', error: null })
    const { result } = renderHook(() => useUpsertExpense('t1'), { wrapper })
    result.current.mutate({
      scope: 'team', description: 'Dinner', currency: 'JPY', total_amount: 12000,
      paid_by: 'm1', category_id: null, spent_on: '2026-11-09',
      splits: [{ member_id: 'm1', amount: 12000 }],
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('record_expense', expect.objectContaining({
      p_trip_id: 't1', p_currency: 'JPY', p_total: 12000, p_paid_by: 'm1',
      p_splits: [{ member_id: 'm1', amount: 12000 }], p_expense_id: null,
    }))
  })
  it('inserts a private expense directly (no RPC)', async () => {
    insert.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useUpsertExpense('t1'), { wrapper })
    result.current.mutate({ scope: 'private', description: 'Souvenir', currency: 'JPY', total_amount: 3700, owner_member_id: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('expenses')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', scope: 'private', owner_member_id: 'm1' }))
  })
})
