import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./SuggestionCard', () => ({
  SuggestionCard: ({ card, canEdit }) => (
    <div data-testid="card" data-dim={!card.matches}>
      {card.title}{canEdit ? ' [edit]' : ''}
    </div>
  ),
}))
import { PlanningBacklog } from './PlanningBacklog'

const trip = {
  id: 't1', start_date: '2026-07-03', end_date: '2026-07-10',
  trip_members: [{ id: 'm1', user_id: 'u1', role: 'host', profiles: { display_name: 'Ana' } }],
  plan_items: [
    { id: 'p1', kind: 'place', category: 'museum', title: 'TNM', avail_days: [2,3,4,5,6,0], avail_open: '09:30:00', avail_close: '17:00:00', created_by: 'm1' },
    { id: 'p2', kind: 'hostel', title: 'Sakura Hostel', created_by: 'm1' },
  ],
  transport: [
    { id: 'l1', category: 'local', method: 'subway', from_text: 'A', to_text: 'B', created_by: 'm1' },
    { id: 'j1', category: 'journey', method: 'flight', from_text: 'KUL', to_text: 'HND' },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('PlanningBacklog', () => {
  it('groups items and excludes journey transport', () => {
    render(<PlanningBacklog trip={trip} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('TNM')).toBeInTheDocument()          // Places
    expect(screen.getByText('Sakura Hostel')).toBeInTheDocument() // Stays
    expect(screen.getByText(/^A → B/)).toBeInTheDocument()        // Local transport
    expect(screen.queryByText(/KUL/)).not.toBeInTheDocument()     // journey excluded
  })

  it('clamps the date filter to the trip window and dims closed places', async () => {
    render(<PlanningBacklog trip={trip} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    const date = screen.getByLabelText(/available on/i)
    expect(date).toHaveAttribute('min', '2026-07-03')
    expect(date).toHaveAttribute('max', '2026-07-10')
    fireEvent.change(date, { target: { value: '2026-07-06' } }) // Monday — TNM (closed Mon) should dim
    const tnm = screen.getByText('TNM').closest('[data-testid="card"]')
    expect(tnm).toHaveAttribute('data-dim', 'true')
  })

  it('does not render any per-section add button (Add lives in the page header now)', () => {
    render(<PlanningBacklog trip={trip} canEdit onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })
})
