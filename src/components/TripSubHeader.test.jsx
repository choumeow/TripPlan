import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripSubHeader } from './TripSubHeader'

const trip = {
  name: 'Tokyo Trip', place: 'Tokyo, Japan', code: 'TRIP·07',
  start_date: '2026-07-12', end_date: '2026-07-19', accent_color: '#0EA5E9',
}

describe('TripSubHeader', () => {
  it('renders the trip identity and a back link', () => {
    render(<MemoryRouter><TripSubHeader trip={trip} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /tokyo trip/i })).toBeInTheDocument()
    expect(screen.getByText(/tokyo, japan/i)).toBeInTheDocument()
    expect(screen.getByText('TRIP·07')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /trips/i })).toHaveAttribute('href', '/')
  })
})
