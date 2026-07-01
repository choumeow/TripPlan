import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { order, select, from } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))
  return { order, select, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { useNotifications } from './useNotifications'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useNotifications', () => {
  it('reads notifications newest-first and derives unreadCount', async () => {
    order.mockResolvedValue({
      data: [
        { id: 'n1', type: 'invite_received', read_at: null, payload: {} },
        { id: 'n2', type: 'invite_accepted', read_at: '2026-07-01T00:00:00Z', payload: {} },
      ],
      error: null,
    })
    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(from).toHaveBeenCalledWith('notifications')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.current.unreadCount).toBe(1)
  })
})
