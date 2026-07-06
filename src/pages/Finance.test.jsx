import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const settle = vi.fn(), del = vi.fn()
vi.mock('../hooks/useSettleDebt', () => ({ useSettleDebt: () => ({ mutate: settle }) }))
vi.mock('../hooks/useDeleteExpense', () => ({ useDeleteExpense: () => ({ mutate: del }) }))
vi.mock('../hooks/useUpsertExpense', () => ({ useUpsertExpense: () => ({ mutate: vi.fn(), isPending: false }) }))
let ctx, authUser
vi.mock('react-router-dom', () => ({ useOutletContext: () => ctx }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }))
import { Finance } from './Finance'

const baseTrip = {
  id: 't1', departure_currency: 'MYR', destination_currency: 'JPY',
  trip_members: [{ id: 'A', user_id: 'uA', role: 'host', display_name: 'Ana' }, { id: 'B', user_id: 'uB', role: 'editor', display_name: 'Ben' }],
  expenses: [{ id: 'e1', scope: 'team', description: 'Dinner', currency: 'JPY', paid_by: 'A', total_amount: 6000, expense_splits: [{ member_id: 'A', amount: 3000 }, { member_id: 'B', amount: 3000 }] }],
  settlements: [], budget_categories: [],
}
beforeEach(() => { vi.clearAllMocks(); ctx = { trip: baseTrip }; authUser = { id: 'uA' } })

describe('Finance', () => {
  it('shows the Team expense list and the balance panel', () => {
    render(<Finance />)
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByText(/who owes whom/i)).toBeInTheDocument()
  })
  it('host sees + Add expense', () => {
    render(<Finance />)
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument()
  })
  it('gates the page when trip currencies are unset', () => {
    ctx = { trip: { ...baseTrip, departure_currency: null, destination_currency: null } }
    render(<Finance />)
    expect(screen.getByText(/set your trip currencies/i)).toBeInTheDocument()
  })
})
