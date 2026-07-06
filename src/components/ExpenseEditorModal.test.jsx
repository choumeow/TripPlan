import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutate = vi.fn()
vi.mock('../hooks/useUpsertExpense', () => ({ useUpsertExpense: () => ({ mutate, isPending: false }) }))
import { ExpenseEditorModal } from './ExpenseEditorModal'

const trip = {
  id: 't1', departure_currency: 'MYR', destination_currency: 'JPY',
  trip_members: [
    { id: 'm1', user_id: 'u1', display_name: 'Hui' },
    { id: 'm2', user_id: 'u2', display_name: 'Sara' },
  ],
  budget_categories: [{ id: 'c1', name: 'Meal' }],
}
beforeEach(() => vi.clearAllMocks())

describe('ExpenseEditorModal', () => {
  it('defaults to an equal, balanced split and saves via mutate', async () => {
    render(<ExpenseEditorModal tripId="t1" trip={trip} memberId="m1" expense={null} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/description/i), 'Dinner')
    await userEvent.clear(screen.getByLabelText(/total/i))
    await userEvent.type(screen.getByLabelText(/total/i), '12000')
    await userEvent.click(screen.getByRole('button', { name: /split equally/i }))
    await userEvent.click(screen.getByRole('button', { name: /save expense/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'team', currency: 'JPY', total_amount: 12000, splits: expect.any(Array) }),
      expect.any(Object),
    )
    const arg = mutate.mock.calls[0][0]
    expect(arg.splits.reduce((t, s) => t + s.amount, 0)).toBeCloseTo(12000, 2)
  })
  it('disables Save when the split does not sum to the total', async () => {
    render(<ExpenseEditorModal tripId="t1" trip={trip} memberId="m1" expense={null} onClose={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText(/total/i))
    await userEvent.type(screen.getByLabelText(/total/i), '12000')
    await userEvent.click(screen.getByRole('button', { name: /split equally/i }))
    const first = screen.getAllByLabelText(/split amount/i)[0]
    await userEvent.clear(first); await userEvent.type(first, '0')
    expect(screen.getByRole('button', { name: /save expense/i })).toBeDisabled()
  })
  it('switches currency via the Departure/Destination/Other field', async () => {
    render(<ExpenseEditorModal tripId="t1" trip={trip} memberId="m1" expense={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /departure/i }))
    await userEvent.clear(screen.getByLabelText(/total/i)); await userEvent.type(screen.getByLabelText(/total/i), '100')
    await userEvent.click(screen.getByRole('button', { name: /split equally/i }))
    await userEvent.type(screen.getByLabelText(/description/i), 'SIM')
    await userEvent.click(screen.getByRole('button', { name: /save expense/i }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'MYR' }), expect.any(Object))
  })
})
