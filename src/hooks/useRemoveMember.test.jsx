import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useRemoveMember } from './useRemoveMember'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useRemoveMember', () => {
  it('calls remove_member with the member id and invalidates the trip', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useRemoveMember('t1'), { wrapper })
    result.current.mutate('m2')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('remove_member', { p_member_id: 'm2' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
})
