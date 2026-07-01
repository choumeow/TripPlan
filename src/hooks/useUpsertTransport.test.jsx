import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, select, eq, insert, update, from } = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const insert = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, update }))
  return { single, select, eq, insert, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpsertTransport } from './useUpsertTransport'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

const leg = {
  direction: 'outbound', method: 'flight', departDate: '2026-07-12', departTime: '14:00',
  from: 'KLIA2', to: 'Haneda', reference: 'JL723', createdBy: 'm1',
}

describe('useUpsertTransport', () => {
  it('inserts a new leg (no id) with mapped columns + created_by', async () => {
    single.mockResolvedValue({ data: { id: 'n1' }, error: null })
    const { result } = renderHook(() => useUpsertTransport('t1'), { wrapper })
    result.current.mutate(leg)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('transport')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      trip_id: 't1', category: 'journey', direction: 'outbound', method: 'flight',
      depart_date: '2026-07-12', depart_time: '14:00',
      from_text: 'KLIA2', to_text: 'Haneda', reference: 'JL723', created_by: 'm1',
    }))
  })

  it('updates an existing leg (with id) and does not clobber created_by', async () => {
    single.mockResolvedValue({ data: { id: 'x1' }, error: null })
    const { result } = renderHook(() => useUpsertTransport('t1'), { wrapper })
    result.current.mutate({ ...leg, id: 'x1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ from_text: 'KLIA2', to_text: 'Haneda' }))
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ created_by: expect.anything() }))
    expect(eq).toHaveBeenCalledWith('id', 'x1')
  })
})
