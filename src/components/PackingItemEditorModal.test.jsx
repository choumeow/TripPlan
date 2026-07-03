import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutate = vi.fn()
vi.mock('../hooks/useUpsertPackingItem', () => ({
  useUpsertPackingItem: () => ({ mutate, isPending: false }),
}))

import { PackingItemEditorModal } from './PackingItemEditorModal'

const members = [
  { id: 'mA', user_id: 'uA', display_name: 'Ana' },
  { id: 'gG', user_id: null, display_name: 'Grandma' },
]
beforeEach(() => vi.clearAllMocks())

describe('PackingItemEditorModal', () => {
  it('shows the assignee field for shared scope only', () => {
    const { rerender } = render(
      <PackingItemEditorModal tripId="t1" memberId="mA" scope="shared" ownerMemberId={null}
        members={members} item={null} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/assign to/i)).toBeInTheDocument()
    rerender(
      <PackingItemEditorModal tripId="t1" memberId="mA" scope="personal" ownerMemberId="mA"
        members={members} item={null} onClose={vi.fn()} />)
    expect(screen.queryByLabelText(/assign to/i)).not.toBeInTheDocument()
  })
  it('blocks save when the title is empty', async () => {
    render(<PackingItemEditorModal tripId="t1" memberId="mA" scope="personal" ownerMemberId="mA"
      members={members} item={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /save item/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/title/i)
  })
  it('saves a shared item with the mapped params', async () => {
    render(<PackingItemEditorModal tripId="t1" memberId="mA" scope="shared" ownerMemberId={null}
      members={members} item={null} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/item name/i), 'Tent')
    await userEvent.click(screen.getByRole('button', { name: 'Gear' }))
    await userEvent.selectOptions(screen.getByLabelText(/assign to/i), 'mA')
    await userEvent.click(screen.getByRole('button', { name: /save item/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'shared', owner_member_id: null, category: 'gear',
        title: 'Tent', assignee_member_id: 'mA', createdBy: 'mA',
      }),
      expect.any(Object),
    )
  })
  it('prefills when editing and keeps the id', async () => {
    const item = { id: 'k1', scope: 'personal', owner_member_id: 'mA', category: 'clothing', title: 'Jacket', assignee_member_id: null }
    render(<PackingItemEditorModal tripId="t1" memberId="mA" scope="personal" ownerMemberId="mA"
      members={members} item={item} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/item name/i)).toHaveValue('Jacket')
    await userEvent.click(screen.getByRole('button', { name: /save item/i }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1', title: 'Jacket' }), expect.any(Object))
  })
})
