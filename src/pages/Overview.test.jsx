import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../components/TransportSection', () => ({ TransportSection: () => <div>TransportSection</div> }))
vi.mock('../components/TravellerList', () => ({
  TravellerList: ({ canManage, onAdd }) => (
    <div>
      TravellerList
      {canManage && <button type="button" onClick={onAdd}>add-traveller-proxy</button>}
    </div>
  ),
}))
vi.mock('../components/EditTripModal', () => ({ EditTripModal: () => <div>EditTripModal</div> }))
vi.mock('../components/AddTravellerModal', () => ({ AddTravellerModal: () => <div>AddTravellerModal</div> }))
vi.mock('../hooks/useRemoveMember', () => ({ useRemoveMember: () => ({ mutate: vi.fn() }) }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { Overview } from './Overview'

const trip = {
  id: 't1', name: 'Tokyo Trip', place: 'Tokyo, Japan', code: 'TRIP·07',
  start_date: '2026-07-12', end_date: '2026-07-19', accent_color: '#0EA5E9',
  trip_members: [{ id: 'm1', user_id: 'u1', role: 'host', profiles: { display_name: 'Ana' } }],
  transport: [],
}

function renderOverview(t = trip) {
  return render(
    <MemoryRouter initialEntries={['/trip/t1/overview']}>
      <Routes>
        <Route path="/trip/:tripId" element={<Outlet context={{ trip: t }} />}>
          <Route path="overview" element={<Overview />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Overview', () => {
  it('renders the trip identity and sub-sections', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview()
    expect(screen.getByRole('heading', { name: /tokyo trip/i })).toBeInTheDocument()
    expect(screen.getByText('TransportSection')).toBeInTheDocument()
    expect(screen.getByText('TravellerList')).toBeInTheDocument()
  })

  it('shows Edit for a host and opens the edit modal', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview()
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText('EditTripModal')).toBeInTheDocument()
  })

  it('hides Edit for a non-writer', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })

  it('lets a host open the add-traveller modal', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview()
    await userEvent.click(screen.getByRole('button', { name: /add-traveller-proxy/i }))
    expect(screen.getByText('AddTravellerModal')).toBeInTheDocument()
  })

  it('does not offer management to a viewer', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.queryByRole('button', { name: /add-traveller-proxy/i })).not.toBeInTheDocument()
  })
})
