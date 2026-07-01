import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn(() => Promise.resolve({ error: null }))
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useDeleteTransport } from './useDeleteTransport'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useDeleteTransport', () => {
  it('deletes the leg by id', async () => {
    const { result } = renderHook(() => useDeleteTransport('t1'), { wrapper })
    result.current.mutate('x1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('transport')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'x1')
  })
})
