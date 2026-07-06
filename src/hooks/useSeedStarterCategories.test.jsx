import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { insert, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useSeedStarterCategories } from './useSeedStarterCategories'

function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useSeedStarterCategories', () => {
  it('inserts the missing starter categories only', async () => {
    insert.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useSeedStarterCategories('t1'), { wrapper })
    result.current.mutate({ createdBy: 'm1', existingNames: ['Meal'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('budget_categories')
    const rows = insert.mock.calls[0][0]
    expect(rows.map((r) => r.name)).toEqual(['Hostel', 'Transport', 'Ticket', 'Photograph'])
    expect(rows.every((r) => r.trip_id === 't1' && r.created_by === 'm1')).toBe(true)
  })

  it('does nothing when all starters already exist', async () => {
    const { result } = renderHook(() => useSeedStarterCategories('t1'), { wrapper })
    result.current.mutate({ createdBy: 'm1', existingNames: ['Hostel', 'Meal', 'Transport', 'Ticket', 'Photograph'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(insert).not.toHaveBeenCalled()
  })
})
