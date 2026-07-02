import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanningSchedule } from './PlanningSchedule'

describe('PlanningSchedule', () => {
  it('renders one column per trip day with its date', () => {
    render(<PlanningSchedule trip={{ start_date: '2026-07-03', end_date: '2026-07-05' }} />)
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 2 · JUL 04/)).toBeInTheDocument()
    expect(screen.getByText(/Day 3 · JUL 05/)).toBeInTheDocument()
    expect(screen.queryByText(/Day 4/)).not.toBeInTheDocument()
  })
  it('shows the coming-soon note', () => {
    render(<PlanningSchedule trip={{ start_date: '2026-07-03', end_date: '2026-07-03' }} />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
