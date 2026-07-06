import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BalancePanel } from './BalancePanel'

const members = [{ id: 'A', display_name: 'Ana' }, { id: 'B', display_name: 'Ben' }]
const expenses = [{
  id: 'e1', scope: 'team', currency: 'JPY', paid_by: 'A', total_amount: 6000,
  expense_splits: [{ member_id: 'A', amount: 3000 }, { member_id: 'B', amount: 3000 }],
}]

describe('BalancePanel', () => {
  it('renders a per-currency debt B → A and fires onSettle', async () => {
    const onSettle = vi.fn()
    render(<BalancePanel expenses={expenses} settlements={[]} members={members} canSettle={() => true} onSettle={onSettle} />)
    expect(screen.getByText(/JPY/i)).toBeInTheDocument()
    expect(screen.getByText('¥3,000')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /settle/i }))
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ from: 'B', to: 'A', amount: 3000, currency: 'JPY' }))
  })
  it('shows an all-settled note when there are no debts', () => {
    render(<BalancePanel expenses={[]} settlements={[]} members={members} canSettle={() => true} onSettle={vi.fn()} />)
    expect(screen.getByText(/all settled/i)).toBeInTheDocument()
  })
})
