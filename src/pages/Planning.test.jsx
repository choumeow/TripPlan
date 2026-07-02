import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../components/PlanningBacklog', () => ({ PlanningBacklog: () => <div>Backlog</div> }))
vi.mock('../components/PlanningSchedule', () => ({ PlanningSchedule: () => <div>Schedule</div> }))
vi.mock('../components/SuggestionEditorModal', () => ({ SuggestionEditorModal: () => <div>EditorModal</div> }))
vi.mock('../hooks/useDeletePlanItem', () => ({ useDeletePlanItem: () => ({ mutate: vi.fn() }) }))
vi.mock('../hooks/useDeleteTransport', () => ({ useDeleteTransport: () => ({ mutate: vi.fn() }) }))
vi.mock('../hooks/useScheduleItem', () => ({ useScheduleItem: () => ({ mutate: vi.fn() }) }))
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
  it('renders both panes and a single Add for a host', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add suggestion/i })).toBeInTheDocument()
  })
  it('opens the editor from the header Add button', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning()
    await userEvent.click(screen.getByRole('button', { name: /add suggestion/i }))
    expect(screen.getByText('EditorModal')).toBeInTheDocument()
  })
  it('hides Add for a viewer (read-only)', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add suggestion/i })).not.toBeInTheDocument()
  })
})
