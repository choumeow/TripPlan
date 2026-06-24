import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
import { useAuth } from '../auth/AuthContext'
import { Dashboard } from './Dashboard'

beforeEach(() => vi.clearAllMocks())

describe('Dashboard', () => {
  it('renders a heading and a sign-out button', async () => {
    const signOut = vi.fn()
    useAuth.mockReturnValue({ signOut })
    render(<Dashboard />)
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
