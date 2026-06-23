import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, eq, select, from } = vi.hoisted(() => {
  const single = vi.fn()
  const eq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { single, eq, select, from }
})

vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useProfile } from './useProfile'

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useProfile', () => {
  it('fetches the current user profile row', async () => {
    useAuth.mockReturnValue({ user: { id: 'abc' } })
    single.mockResolvedValue({
      data: { id: 'abc', display_name: 'Ana', onboarded: true },
      error: null,
    })

    const { result } = renderHook(() => useProfile(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'abc')
    expect(result.current.data.display_name).toBe('Ana')
  })

  it('is disabled when there is no user', () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useProfile(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
