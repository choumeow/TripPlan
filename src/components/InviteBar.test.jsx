import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/usePendingInvites', () => ({ usePendingInvites: vi.fn() }))
vi.mock('../hooks/useRespondInvite', () => ({ useRespondInvite: vi.fn() }))

import { usePendingInvites } from '../hooks/usePendingInvites'
import { useRespondInvite } from '../hooks/useRespondInvite'
import { InviteBar } from './InviteBar'

const tokyo = { trip_id: 't1', trip_name: 'Tokyo Trip', role: 'editor', actor_name: 'Ana' }
const bali = { trip_id: 't2', trip_name: 'Bali', role: 'viewer', actor_name: 'Ben' }
const lisbon = { trip_id: 't3', trip_name: 'Lisbon', role: 'editor', actor_name: 'Cy' }

beforeEach(() => {
  vi.clearAllMocks()
  useRespondInvite.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

describe('InviteBar', () => {
  it('renders nothing when there are no pending invites', () => {
    usePendingInvites.mockReturnValue({ invites: [] })
    const { container } = render(<InviteBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a single invite with Accept/Decline and no Show all toggle', () => {
    usePendingInvites.mockReturnValue({ invites: [tokyo] })
    render(<InviteBar />)
    expect(screen.getByRole('region', { name: /trip invitations/i })).toBeInTheDocument()
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept invite to Tokyo Trip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline invite to Tokyo Trip' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument()
  })

  it('accepts and declines with the invite trip id', async () => {
    const respond = vi.fn()
    useRespondInvite.mockReturnValue({ mutate: respond, isPending: false })
    usePendingInvites.mockReturnValue({ invites: [tokyo] })
    render(<InviteBar />)
    await userEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(respond).toHaveBeenCalledWith({ tripId: 't1', accept: true })
    await userEvent.click(screen.getByRole('button', { name: /decline/i }))
    expect(respond).toHaveBeenCalledWith({ tripId: 't1', accept: false })
  })

  it('shows only the newest of several invites until Show all is clicked', async () => {
    usePendingInvites.mockReturnValue({ invites: [tokyo, bali, lisbon] })
    render(<InviteBar />)
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
    expect(screen.queryByText('Ben invited you to Bali as viewer')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Show all (3)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)

    expect(screen.getByText('Ben invited you to Bali as viewer')).toBeInTheDocument()
    expect(screen.getByText('Cy invited you to Lisbon as editor')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^accept/i })).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.queryByText('Ben invited you to Bali as viewer')).not.toBeInTheDocument()
  })

  it('responds to an invite from the expanded list', async () => {
    const respond = vi.fn()
    useRespondInvite.mockReturnValue({ mutate: respond, isPending: false })
    usePendingInvites.mockReturnValue({ invites: [tokyo, bali] })
    render(<InviteBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all (2)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept invite to Bali' }))
    expect(respond).toHaveBeenCalledWith({ tripId: 't2', accept: true })
  })

  it('disables the actions while a response is in flight', () => {
    useRespondInvite.mockReturnValue({ mutate: vi.fn(), isPending: true })
    usePendingInvites.mockReturnValue({ invites: [tokyo] })
    render(<InviteBar />)
    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled()
  })

  it('shows a failed response under the invite it was for', () => {
    useRespondInvite.mockReturnValue({
      mutate: vi.fn(), isPending: false, isError: true,
      error: { message: 'network down' }, variables: { tripId: 't1', accept: true },
    })
    usePendingInvites.mockReturnValue({ invites: [tokyo] })
    render(<InviteBar />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not update this invite. Please try again.')
  })

  it('explains a stale invite', () => {
    useRespondInvite.mockReturnValue({
      mutate: vi.fn(), isPending: false, isError: true,
      error: { message: 'no pending invite' }, variables: { tripId: 't1', accept: true },
    })
    usePendingInvites.mockReturnValue({ invites: [tokyo] })
    render(<InviteBar />)
    expect(screen.getByRole('alert')).toHaveTextContent('This invite is no longer available.')
  })

  it('does not pin an old error on a different invite', () => {
    useRespondInvite.mockReturnValue({
      mutate: vi.fn(), isPending: false, isError: true,
      error: { message: 'network down' }, variables: { tripId: 'gone', accept: true },
    })
    usePendingInvites.mockReturnValue({ invites: [tokyo] })
    render(<InviteBar />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
