import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useCreateTrip } from './useCreateTrip'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useCreateTrip', () => {
  it('calls the create_trip RPC with mapped params', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    rpc.mockResolvedValue({ data: { id: 't9' }, error: null })

    const { result } = renderHook(() => useCreateTrip(), { wrapper })
    result.current.mutate({
      name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('create_trip', {
      p_name: 'Tokyo', p_place: 'Tokyo, Japan', p_start: '2026-07-12', p_end: '2026-07-19',
    })
  })

  it('surfaces an RPC error', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const { result } = renderHook(() => useCreateTrip(), { wrapper })
    result.current.mutate({ name: 'x', place: 'y', startDate: '2026-07-12', endDate: '2026-07-19' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
