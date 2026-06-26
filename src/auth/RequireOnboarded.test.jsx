import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../hooks/useProfile', () => ({ useProfile: vi.fn() }))
import { useProfile } from '../hooks/useProfile'
import { RequireOnboarded } from './RequireOnboarded'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireOnboarded />}>
          <Route path="/" element={<div>App Home</div>} />
        </Route>
        <Route path="/onboarding" element={<div>Onboarding Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('RequireOnboarded', () => {
  it('shows loading while the profile loads', () => {
    useProfile.mockReturnValue({ data: undefined, isLoading: true })
    renderApp()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /onboarding when the profile is not onboarded', () => {
    useProfile.mockReturnValue({ data: { onboarded: false }, isLoading: false })
    renderApp()
    expect(screen.getByText('Onboarding Page')).toBeInTheDocument()
  })

  it('renders the outlet when the profile is onboarded', () => {
    useProfile.mockReturnValue({ data: { onboarded: true }, isLoading: false })
    renderApp()
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })

  it('shows a recoverable error (not the app) when the profile fails to load', () => {
    useProfile.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })
    renderApp()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('App Home')).not.toBeInTheDocument()
  })
})
