import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useTrips', () => ({ useTrips: vi.fn() }))
vi.mock('../components/CreateTripModal', () => ({
  CreateTripModal: ({ isOpen }) => (isOpen ? <div>Create Modal</div> : null),
}))
vi.mock('../components/TripTimeline', () => ({
  TripTimeline: ({ trips }) => <div>Timeline: {trips.length}</div>,
}))

import { useTrips } from '../hooks/useTrips'
import { Dashboard } from './Dashboard'

beforeEach(() => vi.clearAllMocks())

describe('Dashboard', () => {
  it('shows the empty state when there are no trips', () => {
    useTrips.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<Dashboard />)
    expect(screen.getByText(/no trips yet/i)).toBeInTheDocument()
  })

  it('shows the timeline when trips exist', () => {
    useTrips.mockReturnValue({ data: [{ id: 't1' }], isLoading: false, isError: false })
    render(<Dashboard />)
    expect(screen.getByText(/timeline: 1/i)).toBeInTheDocument()
  })

  it('opens the create modal from the header button', async () => {
    useTrips.mockReturnValue({ data: [{ id: 't1' }], isLoading: false, isError: false })
    render(<Dashboard />)
    await userEvent.click(screen.getByRole('button', { name: /new trip/i }))
    expect(screen.getByText('Create Modal')).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    const refetch = vi.fn()
    useTrips.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch })
    render(<Dashboard />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
