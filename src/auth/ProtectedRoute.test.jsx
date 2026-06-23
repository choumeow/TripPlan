import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))
import { useAuth } from './AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Protected</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ProtectedRoute', () => {
  it('shows a loading state while auth resolves', () => {
    useAuth.mockReturnValue({ user: null, loading: true })
    renderApp()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /login when there is no user', () => {
    useAuth.mockReturnValue({ user: null, loading: false })
    renderApp()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('renders the protected outlet when a user is present', () => {
    useAuth.mockReturnValue({ user: { id: '1' }, loading: false })
    renderApp()
    expect(screen.getByText('Protected')).toBeInTheDocument()
  })
})
