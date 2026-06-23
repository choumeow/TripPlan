import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
import { useAuth } from '../auth/AuthContext'
import { Login } from './Login'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Login', () => {
  it('calls signInWithGoogle when the button is clicked', async () => {
    const signInWithGoogle = vi.fn()
    useAuth.mockReturnValue({ user: null, signInWithGoogle })
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })

  it('redirects to the dashboard when already signed in', () => {
    useAuth.mockReturnValue({ user: { id: '1' }, signInWithGoogle: vi.fn() })
    renderApp()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
