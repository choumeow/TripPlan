import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackingList } from './PackingList'

const members = [{ id: 'mA', user_id: 'uA', display_name: 'Ana' }]
const shared = [
  { id: 's1', scope: 'shared', category: 'gear', title: 'Tent', packed: true, assignee_member_id: 'mA' },
  { id: 's2', scope: 'shared', category: 'documents', title: 'Passport copies', packed: false, assignee_member_id: null },
]

describe('PackingList', () => {
  it('renders title, progress and category headers with rows', () => {
    render(<PackingList title="Shared" glyph="🎒" scope="shared" items={shared} members={members}
      canAdd canManage hint="Visible to everyone." onAdd={vi.fn()} onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /shared/i })).toBeInTheDocument()
    expect(screen.getByText('1 / 2 packed')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
    expect(screen.getByText('Gear')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()          // resolved assignee
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument()   // null assignee
  })
  it('shows + Add only when canAdd and fires onAdd', async () => {
    const onAdd = vi.fn()
    const { rerender } = render(<PackingList title="Shared" glyph="🎒" scope="shared" items={shared} members={members}
      canAdd={false} canManage={false} hint="x" onAdd={onAdd} onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument()
    rerender(<PackingList title="Shared" glyph="🎒" scope="shared" items={shared} members={members}
      canAdd canManage hint="x" onAdd={onAdd} onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add item/i }))
    expect(onAdd).toHaveBeenCalled()
  })
  it('shows an empty prompt when there are no items', () => {
    render(<PackingList title="Your list" glyph="🧳" scope="personal" items={[]} members={members}
      canAdd canManage hint="Private to you." onAdd={vi.fn()} onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/nothing packed yet/i)).toBeInTheDocument()
  })
})
