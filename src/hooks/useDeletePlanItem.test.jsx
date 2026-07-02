import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useDeletePlanItem } from './useDeletePlanItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useDeletePlanItem', () => {
  it('deletes by id', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeletePlanItem('t1'), { wrapper })
    result.current.mutate('p1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('plan_items')
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })
})
