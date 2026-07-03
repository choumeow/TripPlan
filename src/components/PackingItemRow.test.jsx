import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackingItemRow } from './PackingItemRow'

const base = { id: 'k1', category: 'gear', title: 'Tent', packed: false, scope: 'shared', assignee_member_id: null }

describe('PackingItemRow', () => {
  it('toggles via the checkbox for anyone (calls onToggle with the item)', async () => {
    const onToggle = vi.fn()
    render(<PackingItemRow item={base} showAssignee assigneeName={null} canManage={false} onToggle={onToggle} onEdit={vi.fn()} onRemove={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /mark tent packed/i }))
    expect(onToggle).toHaveBeenCalledWith(base)
  })
  it('shows the assignee name on shared rows, or Unassigned', () => {
    const { rerender } = render(<PackingItemRow item={base} showAssignee assigneeName="Ana" canManage={false} onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    rerender(<PackingItemRow item={base} showAssignee assigneeName={null} canManage={false} onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument()
  })
  it('hides the assignee chip when showAssignee is false (personal rows)', () => {
    render(<PackingItemRow item={{ ...base, scope: 'personal' }} showAssignee={false} assigneeName={null} canManage onToggle={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByText(/unassigned/i)).not.toBeInTheDocument()
  })
  it('shows edit/remove only when canManage, and does not toggle when clicked', async () => {
    const onEdit = vi.fn(); const onRemove = vi.fn(); const onToggle = vi.fn()
    const { rerender } = render(<PackingItemRow item={base} showAssignee assigneeName={null} canManage={false} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit tent/i })).not.toBeInTheDocument()
    rerender(<PackingItemRow item={base} showAssignee assigneeName={null} canManage onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit tent/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove tent/i }))
    expect(onEdit).toHaveBeenCalledWith(base)
    expect(onRemove).toHaveBeenCalledWith(base)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
