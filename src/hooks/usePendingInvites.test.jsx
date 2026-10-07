import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { usePendingInvites } from './usePendingInvites'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('usePendingInvites', () => {
  it('reads the pending invites through the my_pending_invites RPC', async () => {
    const invites = [
      { trip_id: 't2', trip_name: 'Bali', role: 'viewer', actor_name: 'Ben' },
      { trip_id: 't1', trip_name: 'Tokyo Trip', role: 'editor', actor_name: 'Ana' },
    ]
    rpc.mockResolvedValue({ data: invites, error: null })
    const { result } = renderHook(() => usePendingInvites(), { wrapper })
    await waitFor(() => expect(result.current.invites).toHaveLength(2))
    expect(rpc).toHaveBeenCalledWith('my_pending_invites')
    expect(result.current.invites).toEqual(invites)
  })

  it('exposes an empty list until the data arrives or when the read fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => usePendingInvites(), { wrapper })
    expect(result.current.invites).toEqual([])
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.invites).toEqual([])
  })
})
