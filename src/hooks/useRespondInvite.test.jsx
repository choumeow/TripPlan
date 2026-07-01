import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useRespondInvite } from './useRespondInvite'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useRespondInvite', () => {
  it('accepts an invite and invalidates notifications, trips, and the trip', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useRespondInvite(), { wrapper })
    result.current.mutate({ tripId: 't1', accept: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('respond_invite', { p_trip_id: 't1', p_accept: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
})
