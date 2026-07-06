import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  return { eq, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useDeleteExpense } from './useDeleteExpense'

function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useDeleteExpense', () => {
  it('deletes by id from expenses', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeleteExpense('t1'), { wrapper })
    result.current.mutate('e1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('expenses')
    expect(eq).toHaveBeenCalledWith('id', 'e1')
  })
})
