import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExpenseRow } from './ExpenseRow'

const exp = { id: 'e1', description: 'Ichiran dinner', currency: 'JPY', total_amount: 12000, paid_by: 'm1', spent_on: '2026-11-09' }

describe('ExpenseRow', () => {
  it('shows description, formatted amount, payer name and split count', () => {
    render(<ExpenseRow expense={exp} paidByName="Hui" splitCount={4} hasReceipt canManage={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Ichiran dinner')).toBeInTheDocument()
    expect(screen.getByText('¥12,000')).toBeInTheDocument()
    expect(screen.getByText(/Hui/)).toBeInTheDocument()
    expect(screen.getByText(/split 4 ways/i)).toBeInTheDocument()
  })
  it('shows edit/remove only when canManage', async () => {
    const onEdit = vi.fn(), onRemove = vi.fn()
    const { rerender } = render(<ExpenseRow expense={exp} paidByName="Hui" splitCount={4} canManage={false} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit ichiran/i })).not.toBeInTheDocument()
    rerender(<ExpenseRow expense={exp} paidByName="Hui" splitCount={4} canManage onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit ichiran/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove ichiran/i }))
    expect(onEdit).toHaveBeenCalledWith(exp); expect(onRemove).toHaveBeenCalledWith(exp)
  })
})
