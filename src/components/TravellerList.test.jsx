import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TravellerList } from './TravellerList'

const trip = (members) => ({ accent_color: '#0EA5E9', trip_members: members })

describe('TravellerList', () => {
  it('renders a single traveller with name and role', () => {
    render(<TravellerList trip={trip([
      { id: 'm1', role: 'host', display_name: null, profiles: { display_name: 'Ana' } },
    ])} />)
    expect(screen.getByText('1 Traveller')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('pluralises and falls back to ghost display_name', () => {
    render(<TravellerList trip={trip([
      { id: 'm1', role: 'host', profiles: { display_name: 'Ana' } },
      { id: 'm2', role: 'viewer', display_name: 'Ben (guest)', profiles: null },
    ])} />)
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
    expect(screen.getByText('Ben (guest)')).toBeInTheDocument()
  })
})
