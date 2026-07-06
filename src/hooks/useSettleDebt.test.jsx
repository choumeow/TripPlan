import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { insert, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useSettleDebt } from './useSettleDebt'

function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useSettleDebt', () => {
  it('inserts a settlement row for the debt', async () => {
    insert.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useSettleDebt('t1'), { wrapper })
    result.current.mutate({ from_member: 'B', to_member: 'A', currency: 'JPY', amount: 3000, createdBy: 'B' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('settlements')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', from_member: 'B', to_member: 'A', currency: 'JPY', amount: 3000, created_by: 'B' }))
  })
})
