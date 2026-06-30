import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripTimeline } from './TripTimeline'

const mk = (id, start_date, end_date) => ({
  id, name: id, place: 'P', start_date, end_date,
  accent_color: '#0EA5E9', code: 'TRIP·01', trip_members: [],
})

describe('TripTimeline', () => {
  it('renders previous, hero, and future trips', () => {
    const trips = [
      mk('past', '2026-02-03', '2026-02-10'),
      mk('soon', '2026-07-12', '2026-07-19'),
      mk('later', '2026-10-02', '2026-10-08'),
    ]
    render(
      <MemoryRouter>
        <TripTimeline trips={trips} today="2026-06-30" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /past/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /soon/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /later/i })).toBeInTheDocument()
    // hero is marked for the layout
    expect(screen.getByTestId('hero-slot')).toHaveTextContent('soon')
  })
})
