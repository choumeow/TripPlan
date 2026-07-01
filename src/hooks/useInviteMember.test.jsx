import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useInviteMember } from './useInviteMember'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useInviteMember', () => {
  it('calls invite_member with trip id, email, role and invalidates the trip', async () => {
    rpc.mockResolvedValue({ data: { id: 'm2' }, error: null })
    const { result } = renderHook(() => useInviteMember('t1'), { wrapper })
    result.current.mutate({ email: 'b@x.com', role: 'editor' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('invite_member', { p_trip_id: 't1', p_email: 'b@x.com', p_role: 'editor' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'no user found' } })
    const { result } = renderHook(() => useInviteMember('t1'), { wrapper })
    result.current.mutate({ email: 'x@y.com', role: 'viewer' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error.message).toBe('no user found')
  })
})
