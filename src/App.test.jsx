import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}))
vi.mock('./lib/supabaseClient', () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}))

import App from './App'

beforeEach(() => vi.clearAllMocks())

describe('App', () => {
  it('shows the Login page when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /sign in with google/i }),
      ).toBeInTheDocument(),
    )
  })
})
