import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { maybeSingle, eq, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { maybeSingle, eq, select, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useTrip } from './useTrip'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTrip', () => {
  it('fetches one trip with members + transport', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 't1', name: 'Tokyo', trip_members: [], transport: [] }, error: null,
    })
    const { result } = renderHook(() => useTrip('t1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('trips')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('transport'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('invite_status'))
    expect(eq).toHaveBeenCalledWith('id', 't1')
    expect(result.current.data.name).toBe('Tokyo')
  })

  it('is disabled with no tripId', () => {
    const { result } = renderHook(() => useTrip(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
