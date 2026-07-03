import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// eslint-disable-next-line no-unused-vars
const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useDeletePackingItem } from './useDeletePackingItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useDeletePackingItem', () => {
  it('deletes by id from packing_items', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeletePackingItem('t1'), { wrapper })
    result.current.mutate('k1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('packing_items')
    expect(eq).toHaveBeenCalledWith('id', 'k1')
  })
})
