import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, select, eq, update, from } = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { single, select, eq, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpdateTrip } from './useUpdateTrip'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useUpdateTrip', () => {
  it('updates the trip with snake_case dates and targets the id', async () => {
    single.mockResolvedValue({ data: { id: 't1' }, error: null })
    const { result } = renderHook(() => useUpdateTrip('t1'), { wrapper })
    result.current.mutate({ name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('trips')
    expect(update).toHaveBeenCalledWith({
      name: 'Tokyo', place: 'Tokyo, Japan', start_date: '2026-07-12', end_date: '2026-07-19',
    })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })

  it('surfaces an update error', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useUpdateTrip('t1'), { wrapper })
    result.current.mutate({ name: 'x', place: 'y', startDate: '2026-07-12', endDate: '2026-07-19' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
