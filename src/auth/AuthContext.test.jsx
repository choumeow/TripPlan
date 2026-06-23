import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { getSession, onAuthStateChange, signInWithOAuth, signOut } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  }),
)

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signInWithOAuth, signOut },
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

function Probe() {
  const { user, loading } = useAuth()
  return <div>{loading ? 'loading' : user ? `user:${user.id}` : 'anon'}</div>
}

beforeEach(() => {
  vi.clearAllMocks()
  onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

describe('AuthProvider', () => {
  it('starts loading, then resolves to anon when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByText('loading')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument())
  })

  it('exposes the user when a session exists', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'abc' } } },
    })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByText('user:abc')).toBeInTheDocument())
  })

  it('throws if useAuth is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/useAuth must be used within/)
    spy.mockRestore()
  })
})
