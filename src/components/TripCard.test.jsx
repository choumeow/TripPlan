import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripCard } from './TripCard'

const trip = {
  id: 't1',
  name: 'Tokyo Trip',
  place: 'Tokyo, Japan',
  start_date: '2026-07-12',
  end_date: '2026-07-19',
  accent_color: '#0EA5E9',
  code: 'TRIP·07',
  trip_members: [
    { id: 'm1', role: 'host', display_name: null, profiles: { display_name: 'Ana' } },
    { id: 'm2', role: 'editor', display_name: null, profiles: { display_name: 'Ben' } },
  ],
}

function renderCard() {
  return render(
    <MemoryRouter>
      <TripCard trip={trip} today="2026-06-30" />
    </MemoryRouter>,
  )
}

describe('TripCard', () => {
  it('shows the front: name, place, dates, countdown', () => {
    renderCard()
    expect(screen.getByText('Tokyo Trip')).toBeInTheDocument()
    expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument()
    expect(screen.getByText('12 days to go')).toBeInTheDocument()
  })

  it('is a link to the trip workspace', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /open tokyo trip/i })
    expect(link).toHaveAttribute('href', '/trip/t1')
  })

  it('renders the back: traveller count and roles (revealed on hover/focus)', () => {
    renderCard()
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })
})
