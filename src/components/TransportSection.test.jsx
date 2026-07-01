import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./TransportEditorModal', () => ({
  TransportEditorModal: ({ initial }) => <div>Editor:{initial.direction}</div>,
}))
const del = vi.fn()
vi.mock('../hooks/useDeleteTransport', () => ({ useDeleteTransport: () => ({ mutate: del }) }))

import { TransportSection } from './TransportSection'

const outbound = {
  id: 'l1', category: 'journey', direction: 'outbound', method: 'flight',
  depart_date: '2026-07-12', depart_time: '14:00', from_text: 'KLIA2', to_text: 'Haneda', reference: 'JL723',
}
const ret = { ...outbound, id: 'l2', direction: 'return', from_text: 'Haneda', to_text: 'KLIA2' }
const trip = (transport) => ({ id: 't1', start_date: '2026-07-12', end_date: '2026-07-19', transport })

beforeEach(() => vi.clearAllMocks())

describe('TransportSection', () => {
  it('renders both groups with legs and metadata', () => {
    render(<TransportSection trip={trip([outbound, ret])} canEdit={false} memberId="m1" />)
    expect(screen.getByText(/getting there/i)).toBeInTheDocument()
    expect(screen.getByText(/getting back/i)).toBeInTheDocument()
    expect(screen.getByText('KLIA2 → Haneda')).toBeInTheDocument()
    expect(screen.getAllByText(/JUL 12/).length).toBeGreaterThan(0)
  })

  it('hides add/edit/remove controls when canEdit is false', () => {
    render(<TransportSection trip={trip([outbound])} canEdit={false} memberId="m1" />)
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('shows an add prompt for an empty group and opens the editor', async () => {
    render(<TransportSection trip={trip([outbound])} canEdit memberId="m1" />)
    expect(screen.getByText(/add your return transport/i)).toBeInTheDocument()
    const addButtons = screen.getAllByRole('button', { name: /add/i })
    await userEvent.click(addButtons[0])
    expect(screen.getByText('Editor:outbound')).toBeInTheDocument()
  })
})
