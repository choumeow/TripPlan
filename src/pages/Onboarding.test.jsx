import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, update, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { eq, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useProfile', () => ({ useProfile: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { Onboarding } from './Onboarding'

function renderApp() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'abc' } })
})

describe('Onboarding', () => {
  it('greets the user and pre-fills the name from the profile', () => {
    useProfile.mockReturnValue({
      data: { display_name: 'Ana', onboarded: false },
      isLoading: false,
    })
    renderApp()
    expect(screen.getByText(/welcome to tripplan/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toHaveValue('Ana')
  })

  it('saves the name and onboarded flag, then navigates to the dashboard', async () => {
    useProfile.mockReturnValue({
      data: { display_name: '', onboarded: false },
      isLoading: false,
    })
    eq.mockResolvedValue({ error: null })
    renderApp()

    const input = screen.getByLabelText(/name/i)
    await userEvent.type(input, 'Bob')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ display_name: 'Bob', onboarded: true })
    expect(eq).toHaveBeenCalledWith('id', 'abc')
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument())
  })

  it('redirects to the dashboard if already onboarded', () => {
    useProfile.mockReturnValue({
      data: { display_name: 'Ana', onboarded: true },
      isLoading: false,
    })
    renderApp()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('blocks saving an empty name', async () => {
    useProfile.mockReturnValue({
      data: { display_name: '', onboarded: false },
      isLoading: false,
    })
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(update).not.toHaveBeenCalled()
  })
})
