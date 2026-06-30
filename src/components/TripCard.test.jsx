import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('TripCard', () => {
  it('shows the front: name, place, dates, countdown', () => {
    render(<TripCard trip={trip} today="2026-06-30" />)
    expect(screen.getByText('Tokyo Trip')).toBeInTheDocument()
    expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument()
    expect(screen.getByText('12 days to go')).toBeInTheDocument()
  })

  it('flips to the back on click, showing travellers and roles', async () => {
    render(<TripCard trip={trip} today="2026-06-30" />)
    await userEvent.click(screen.getByRole('button', { name: /tokyo trip/i }))
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('flips with the keyboard', async () => {
    render(<TripCard trip={trip} today="2026-06-30" />)
    const card = screen.getByRole('button', { name: /tokyo trip/i })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
  })
})
