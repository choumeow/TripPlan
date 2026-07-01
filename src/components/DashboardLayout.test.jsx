import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Notifications" />,
}))
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from './DashboardLayout'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<div>Trips content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('DashboardLayout', () => {
  it('renders the brand, a notifications button, and the page outlet', () => {
    useAuth.mockReturnValue({ signOut: vi.fn() })
    renderApp()
    expect(screen.getByText('TripPlan')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /notifications/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Trips content')).toBeInTheDocument()
  })

  it('signs out when the sign-out button is clicked', async () => {
    const signOut = vi.fn()
    useAuth.mockReturnValue({ signOut })
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
