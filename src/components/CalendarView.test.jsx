import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { CalendarView } from './CalendarView'

const trip = {
  start_date: '2026-07-03', end_date: '2026-07-04', trip_members: [],
  plan_items: [
    { id: 'timed', kind: 'place', category: 'meal', title: 'Ichiran', scheduled_date: '2026-07-03', start_time: '09:00:00', duration_min: 60, sort_order: 0 },
    { id: 'parked', kind: 'place', category: 'visit', title: 'Senso-ji', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
  ],
  transport: [],
}

function renderCal(canEdit = true) {
  return render(
    <DndContext>
      <CalendarView trip={trip} canEdit={canEdit} onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('CalendarView', () => {
  it('renders a column per trip day', () => {
    renderCal()
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 2 · JUL 04/)).toBeInTheDocument()
  })
  it('places a timed item as a block and parks a no-time item', () => {
    renderCal()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()   // timed block
    expect(screen.getByText('Senso-ji')).toBeInTheDocument()  // parked
    expect(screen.getByText('Untimed')).toBeInTheDocument()
  })
})
