import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import { PlanningSchedule } from './PlanningSchedule'

const trip = {
  start_date: '2026-07-03', end_date: '2026-07-05',
  plan_items: [{ id: 'b', kind: 'place', category: 'meal', title: 'B', scheduled_date: '2026-07-03', start_time: '09:00:00', sort_order: 0 }],
  transport: [],
}

function renderSched() {
  return render(
    <DndContext>
      <PlanningSchedule trip={trip} canEdit onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('PlanningSchedule', () => {
  it('shows the Board by default with a column per trip day and scheduled items placed', () => {
    renderSched()
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 3 · JUL 05/)).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument() // placed on Day 1
  })
  it('switches to Calendar/Thread placeholders via the toggle', async () => {
    renderSched()
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
    expect(screen.queryByText(/Day 1 · JUL 03/)).not.toBeInTheDocument()
  })
})
