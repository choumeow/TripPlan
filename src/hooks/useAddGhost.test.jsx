import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useAddGhost } from './useAddGhost'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useAddGhost', () => {
  it('calls add_ghost with trip id + name and invalidates the trip', async () => {
    rpc.mockResolvedValue({ data: { id: 'm3' }, error: null })
    const { result } = renderHook(() => useAddGhost('t1'), { wrapper })
    result.current.mutate('Grandpa Joe')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('add_ghost', { p_trip_id: 't1', p_name: 'Grandpa Joe' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
})
