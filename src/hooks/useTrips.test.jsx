import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { select, from } = vi.hoisted(() => {
  const select = vi.fn()
  const from = vi.fn(() => ({ select }))
  return { select, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useTrips } from './useTrips'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTrips', () => {
  it('fetches trips with embedded members', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    select.mockResolvedValue({ data: [{ id: 't1', name: 'Tokyo', trip_members: [] }], error: null })

    const { result } = renderHook(() => useTrips(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('trips')
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('trip_members'),
    )
    expect(result.current.data[0].name).toBe('Tokyo')
  })

  it('is disabled with no user', () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useTrips(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
