import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toggle = vi.fn()
vi.mock('../hooks/useTogglePacked', () => ({ useTogglePacked: () => ({ mutate: toggle }) }))
vi.mock('../hooks/useUpsertPackingItem', () => ({ useUpsertPackingItem: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('../hooks/useDeletePackingItem', () => ({ useDeletePackingItem: () => ({ mutate: vi.fn() }) }))

let ctx
vi.mock('react-router-dom', () => ({ useOutletContext: () => ctx }))
let authUser
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }))

import { Packing } from './Packing'

const trip = {
  id: 't1',
  trip_members: [
    { id: 'mHost', user_id: 'uHost', role: 'host', display_name: 'Ana' },
    { id: 'mView', user_id: 'uView', role: 'viewer', display_name: 'Ben' },
    { id: 'gG', user_id: null, role: 'viewer', display_name: 'Grandma' },
  ],
  packing_items: [
    { id: 's1', scope: 'shared', owner_member_id: null, category: 'gear', title: 'Tent', packed: false, assignee_member_id: null },
    { id: 'h1', scope: 'personal', owner_member_id: 'mHost', category: 'clothing', title: 'Jacket', packed: false, assignee_member_id: null },
    { id: 'v1', scope: 'personal', owner_member_id: 'mView', category: 'clothing', title: 'Secret', packed: false, assignee_member_id: null },
    { id: 'g1', scope: 'personal', owner_member_id: 'gG', category: 'toiletries', title: 'Meds', packed: false, assignee_member_id: null },
  ],
}
beforeEach(() => { vi.clearAllMocks(); ctx = { trip }; authUser = { id: 'uHost' } })

describe('Packing', () => {
  it('shows the shared list first and toggles an item for anyone', async () => {
    render(<Packing />)
    expect(screen.getByRole('heading', { name: /shared/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /mark tent packed/i }))
    expect(toggle).toHaveBeenCalledWith({ id: 's1', packed: true })
  })
  it('switches to your own list and hides other members\' personal items', async () => {
    render(<Packing />)
    await userEvent.click(screen.getByRole('button', { name: /your list/i }))
    expect(screen.getByText('Jacket')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })
  it('host sees + Add on the shared list', () => {
    render(<Packing />)
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })
  it('viewer sees shared read-only (no + Add) but can still tick', async () => {
    authUser = { id: 'uView' }
    render(<Packing />)
    expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /mark tent packed/i }))
    expect(toggle).toHaveBeenCalledWith({ id: 's1', packed: true })
  })
  it('viewer can + Add on their own list', async () => {
    authUser = { id: 'uView' }
    render(<Packing />)
    await userEvent.click(screen.getByRole('button', { name: /your list/i }))
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })
})
