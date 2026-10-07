import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('renders invite_received as text only (no Accept/Decline)', () => {
    render(<NotificationItem notification={received} />)
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders an informational notification', () => {
    render(<NotificationItem notification={accepted} />)
    expect(screen.getByText('Ben accepted your invite to Tokyo Trip')).toBeInTheDocument()
  })

  it('renders nothing for an unknown type', () => {
    const { container } = render(
      <NotificationItem notification={{ id: 'x', type: 'nope', payload: {} }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
