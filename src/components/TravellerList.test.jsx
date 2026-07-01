import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('TravellerList — management affordances', () => {
  const members = [
    { id: 'm1', role: 'host', profiles: { display_name: 'Ana' }, invite_status: 'accepted' },
    { id: 'm2', role: 'editor', profiles: { display_name: 'Ben' }, invite_status: 'pending' },
  ]

  it('marks a pending contributor', () => {
    render(<TravellerList trip={trip(members)} />)
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('hides add/remove affordances when not managing', () => {
    render(<TravellerList trip={trip(members)} />)
    expect(screen.queryByRole('button', { name: /add traveller/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove ben/i })).not.toBeInTheDocument()
  })

  it('shows an add button and per-member remove (except the host) when managing', async () => {
    const onAdd = vi.fn(); const onRemove = vi.fn()
    render(<TravellerList trip={trip(members)} canManage onAdd={onAdd} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /add traveller/i }))
    expect(onAdd).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /remove ana/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove ben/i }))
    expect(onRemove).toHaveBeenCalledWith(members[1])
  })
})
