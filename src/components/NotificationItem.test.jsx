import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationItem } from './NotificationItem'

const received = {
  id: 'n1', type: 'invite_received', read_at: null,
  payload: { trip_id: 't1', actor_name: 'Ana', trip_name: 'Tokyo Trip', role: 'editor' },
}
const accepted = {
  id: 'n2', type: 'invite_accepted', read_at: '2026-07-01T00:00:00Z',
  payload: { trip_id: 't1', actor_name: 'Ben', trip_name: 'Tokyo Trip' },
}

describe('NotificationItem', () => {
  it('renders invite_received text with Accept/Decline that call the handlers', async () => {
    const onAccept = vi.fn(); const onDecline = vi.fn()
    render(<NotificationItem notification={received} onAccept={onAccept} onDecline={onDecline} />)
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(onAccept).toHaveBeenCalledWith(received)
    await userEvent.click(screen.getByRole('button', { name: /decline/i }))
    expect(onDecline).toHaveBeenCalledWith(received)
  })

  it('renders an informational notification with no action buttons', () => {
    render(<NotificationItem notification={accepted} onAccept={vi.fn()} onDecline={vi.fn()} />)
    expect(screen.getByText('Ben accepted your invite to Tokyo Trip')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
  })

  it('renders nothing for an unknown type', () => {
    const { container } = render(
      <NotificationItem notification={{ id: 'x', type: 'nope', payload: {} }} onAccept={vi.fn()} onDecline={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
