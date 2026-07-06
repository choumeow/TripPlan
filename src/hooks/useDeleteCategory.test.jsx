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

import { useDeleteCategory } from './useDeleteCategory'

function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useDeleteCategory', () => {
  it('deletes by id from budget_categories', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeleteCategory('t1'), { wrapper })
    result.current.mutate('c1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('budget_categories')
    expect(eq).toHaveBeenCalledWith('id', 'c1')
  })
})
