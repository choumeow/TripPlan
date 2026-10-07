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

// reset (not just clear): the last test swaps in its own invalidate implementation
beforeEach(() => vi.resetAllMocks())

describe('useRespondInvite', () => {
  it('accepts an invite and invalidates invites, notifications, trips, and the trip', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useRespondInvite(), { wrapper })
    result.current.mutate({ tripId: 't1', accept: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('respond_invite', { p_trip_id: 't1', p_accept: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invites', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })

  it('still refreshes the invite list when responding fails (stale invite)', async () => {
    rpc.mockResolvedValue({ error: { message: 'no pending invite' } })
    const { result } = renderHook(() => useRespondInvite(), { wrapper })
    result.current.mutate({ tripId: 't1', accept: false })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invites', 'u1'] })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['trips', 'u1'] })
  })

  it('stays pending until the invite list has refetched', async () => {
    rpc.mockResolvedValue({ error: null })
    let finishRefetch
    invalidate.mockImplementation(({ queryKey }) =>
      queryKey[0] === 'invites' ? new Promise((resolve) => { finishRefetch = resolve }) : Promise.resolve())
    const { result } = renderHook(() => useRespondInvite(), { wrapper })
    result.current.mutate({ tripId: 't1', accept: true })
    await waitFor(() => expect(finishRefetch).toBeTypeOf('function'))
    expect(result.current.isPending).toBe(true)
    finishRefetch()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
