import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
vi.mock('../hooks/useMarkNotificationsRead', () => ({ useMarkNotificationsRead: vi.fn() }))
vi.mock('../hooks/useRespondInvite', () => ({ useRespondInvite: vi.fn() }))

import { useNotifications } from '../hooks/useNotifications'
import { useMarkNotificationsRead } from '../hooks/useMarkNotificationsRead'
import { useRespondInvite } from '../hooks/useRespondInvite'
import { NotificationBell } from './NotificationBell'

const invite = {
  id: 'n1', type: 'invite_received', read_at: null,
  payload: { trip_id: 't1', actor_name: 'Ana', trip_name: 'Tokyo Trip', role: 'editor' },
}

beforeEach(() => {
  vi.clearAllMocks()
  useMarkNotificationsRead.mockReturnValue({ mutate: vi.fn() })
  useRespondInvite.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

describe('NotificationBell', () => {
  it('shows the unread badge count', () => {
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('opens the panel and marks read on open, listing notifications', async () => {
    const mark = vi.fn()
    useMarkNotificationsRead.mockReturnValue({ mutate: mark })
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(mark).toHaveBeenCalledWith(null)
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
  })

  it('accepting an invite responds with the payload trip id', async () => {
    const respond = vi.fn()
    useRespondInvite.mockReturnValue({ mutate: respond, isPending: false })
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    await userEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(respond).toHaveBeenCalledWith({ tripId: 't1', accept: true })
  })

  it('shows an empty state when there are no notifications', async () => {
    useNotifications.mockReturnValue({ items: [], unreadCount: 0 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
  })

  it('surfaces a stale-invite error when responding fails', async () => {
    useRespondInvite.mockReturnValue({
      mutate: vi.fn(), isPending: false, isError: true, error: { message: 'no pending invite' },
    })
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  })
})
