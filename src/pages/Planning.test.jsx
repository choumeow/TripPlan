import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../components/PlanningBacklog', () => ({
  PlanningBacklog: ({ canEdit, onAdd }) => (
    <div>
      <span>Backlog</span>
      {canEdit && <span>canEdit</span>}
      <button type="button" onClick={() => onAdd('visit')}>add-proxy</button>
    </div>
  ),
}))
vi.mock('../components/SuggestionEditorModal', () => ({ SuggestionEditorModal: () => <div>EditorModal</div> }))
vi.mock('../hooks/useDeletePlanItem', () => ({ useDeletePlanItem: () => ({ mutate: vi.fn() }) }))
vi.mock('../hooks/useDeleteTransport', () => ({ useDeleteTransport: () => ({ mutate: vi.fn() }) }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { Planning } from './Planning'

const trip = {
  id: 't1', start_date: '2026-07-03', end_date: '2026-07-10',
  trip_members: [{ id: 'm1', user_id: 'u1', role: 'host', profiles: { display_name: 'Ana' } }],
  plan_items: [], transport: [],
}

function renderPlanning(t = trip) {
  return render(
    <MemoryRouter initialEntries={['/trip/t1/planning']}>
      <Routes>
        <Route path="/trip/:tripId" element={<Outlet context={{ trip: t }} />}>
          <Route path="planning" element={<Planning />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
beforeEach(() => vi.clearAllMocks())

describe('Planning', () => {
  it('renders the backlog with edit rights for a host', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('canEdit')).toBeInTheDocument()
  })
  it('opens the editor from an add action', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning()
    await userEvent.click(screen.getByRole('button', { name: /add-proxy/i }))
    expect(screen.getByText('EditorModal')).toBeInTheDocument()
  })
  it('is read-only for a viewer', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.queryByText('canEdit')).not.toBeInTheDocument()
  })
})
