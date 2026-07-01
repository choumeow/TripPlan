import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

vi.mock('../hooks/useTrip', () => ({ useTrip: vi.fn() }))
vi.mock('../components/TripSubHeader', () => ({ TripSubHeader: () => <div>SubHeader</div> }))
vi.mock('../components/TripTabs', () => ({ TripTabs: () => <div>Tabs</div> }))

import { useTrip } from '../hooks/useTrip'
import { TripWorkspace } from './TripWorkspace'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trip/:tripId" element={<TripWorkspace />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<div>Overview Page</div>} />
        </Route>
        <Route path="/" element={<div>Trips Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('TripWorkspace', () => {
  it('shows a loading state', () => {
    useTrip.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderAt('/trip/t1/overview')
    expect(screen.getByText(/loading trip/i)).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    useTrip.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() })
    renderAt('/trip/t1/overview')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows a not-found state when the trip is missing / no access', () => {
    useTrip.mockReturnValue({ data: null, isLoading: false, isError: false })
    renderAt('/trip/t1/overview')
    expect(screen.getByText(/trip not found/i)).toBeInTheDocument()
  })

  it('renders the shell + outlet when loaded', () => {
    useTrip.mockReturnValue({ data: { id: 't1', name: 'Tokyo' }, isLoading: false, isError: false })
    renderAt('/trip/t1/overview')
    expect(screen.getByText('SubHeader')).toBeInTheDocument()
    expect(screen.getByText('Tabs')).toBeInTheDocument()
    expect(screen.getByText('Overview Page')).toBeInTheDocument()
  })

  it('redirects the index route to overview', () => {
    useTrip.mockReturnValue({ data: { id: 't1', name: 'Tokyo' }, isLoading: false, isError: false })
    renderAt('/trip/t1')
    expect(screen.getByText('Overview Page')).toBeInTheDocument()
  })
})
