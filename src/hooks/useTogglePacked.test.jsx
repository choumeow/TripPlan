import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))

import { useTogglePacked } from './useTogglePacked'

let client
function wrapper({ children }) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['trip', 't1'], { id: 't1', packing_items: [{ id: 'k1', packed: false }] })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useTogglePacked', () => {
  it('calls the RPC with mapped params', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useTogglePacked('t1'), { wrapper })
    result.current.mutate({ id: 'k1', packed: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('set_packing_packed', { p_item_id: 'k1', p_packed: true })
  })
  it('optimistically flips the cached item, then rolls back on error', async () => {
    rpc.mockResolvedValue({ error: { message: 'forbidden' } })
    const { result } = renderHook(() => useTogglePacked('t1'), { wrapper })
    result.current.mutate({ id: 'k1', packed: true })
    await waitFor(() => expect(result.current.isError).toBe(true))
    // after rollback the cached item is back to packed:false
    expect(client.getQueryData(['trip', 't1']).packing_items[0].packed).toBe(false)
  })
})
