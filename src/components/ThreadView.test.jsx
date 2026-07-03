import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { ThreadView } from './ThreadView'

const trip = {
  start_date: '2026-07-03', end_date: '2026-07-05', trip_members: [],
  plan_items: [
    { id: 'a', kind: 'place', category: 'meal', title: 'Ichiran', scheduled_date: '2026-07-03', start_time: '09:00:00', sort_order: 0 },
    { id: 'b', kind: 'place', category: 'visit', title: 'Senso-ji', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
  ],
  transport: [],
}

function renderThread(canEdit = true) {
  return render(
    <DndContext>
      <ThreadView trip={trip} canEdit={canEdit} onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('ThreadView', () => {
  it('renders a rail divider per trip day', () => {
    renderThread()
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 2 · JUL 04/)).toBeInTheDocument()
    expect(screen.getByText(/Day 3 · JUL 05/)).toBeInTheDocument()
  })
  it('lists a day\'s items in order and shows a placeholder for empty days', () => {
    renderThread()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()
    expect(screen.getByText('Senso-ji')).toBeInTheDocument()
    // Day 2 and Day 3 are empty → two "drop here" placeholders
    expect(screen.getAllByText(/nothing planned/i)).toHaveLength(2)
  })
  it('hides edit affordances for viewers', () => {
    renderThread(false)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })
})
