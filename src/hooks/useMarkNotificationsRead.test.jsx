import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { useMarkNotificationsRead } from './useMarkNotificationsRead'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useMarkNotificationsRead', () => {
  it('calls the RPC with the given ids (or null for all)', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper })
    result.current.mutate(null)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: null })
  })
})
