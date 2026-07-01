import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useInviteMember', () => ({ useInviteMember: vi.fn() }))
vi.mock('../hooks/useAddGhost', () => ({ useAddGhost: vi.fn() }))

import { useInviteMember } from '../hooks/useInviteMember'
import { useAddGhost } from '../hooks/useAddGhost'
import { AddTravellerModal } from './AddTravellerModal'

beforeEach(() => {
  vi.clearAllMocks()
  useInviteMember.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useAddGhost.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

describe('AddTravellerModal', () => {
  it('blocks invite when the email is invalid', async () => {
    const invite = vi.fn()
    useInviteMember.mockReturnValue({ mutate: invite, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(invite).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
  })

  it('invites with a valid email and the chosen role', async () => {
    const invite = vi.fn()
    useInviteMember.mockReturnValue({ mutate: invite, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'b@x.com')
    await userEvent.click(screen.getByRole('button', { name: /^viewer$/i }))
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(invite).toHaveBeenCalledWith({ email: 'b@x.com', role: 'viewer' }, expect.any(Object))
  })

  it('switches to ghost mode and adds by name', async () => {
    const addGhost = vi.fn()
    useAddGhost.mockReturnValue({ mutate: addGhost, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add ghost/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'Grandpa Joe')
    await userEvent.click(screen.getByRole('button', { name: /add joiner/i }))
    expect(addGhost).toHaveBeenCalledWith('Grandpa Joe', expect.any(Object))
  })

  it('blocks a ghost with an empty name', async () => {
    const addGhost = vi.fn()
    useAddGhost.mockReturnValue({ mutate: addGhost, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add ghost/i }))
    await userEvent.click(screen.getByRole('button', { name: /add joiner/i }))
    expect(addGhost).not.toHaveBeenCalled()
    expect(screen.getByText(/enter a name/i)).toBeInTheDocument()
  })
})
