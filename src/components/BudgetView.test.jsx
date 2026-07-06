import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetView } from './BudgetView'

const tripWithCats = {
  budget_categories: [{ id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }],
  expenses: [
    { scope: 'team', category_id: 'c1', currency: 'JPY', total_amount: 31000 },
    { scope: 'team', category_id: null, currency: 'JPY', total_amount: 5000 },  // uncategorized
    { scope: 'private', category_id: null, currency: 'JPY', total_amount: 999 }, // ignored
  ],
}
const emptyTrip = { budget_categories: [], expenses: [] }

describe('BudgetView', () => {
  it('lists categories, the uncategorized section and the totals panel', () => {
    render(<BudgetView trip={tripWithCats} canManage onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={vi.fn()} />)
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText(/uncategorized/i)).toBeInTheDocument()
    expect(screen.getByText('Budget total')).toBeInTheDocument()
  })
  it('shows the empty state with seed + new buttons for a manager', async () => {
    const onSeed = vi.fn(), onAdd = vi.fn()
    render(<BudgetView trip={emptyTrip} canManage onAdd={onAdd} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={onSeed} />)
    expect(screen.getByText(/no budget categories yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add starter categories/i }))
    await userEvent.click(screen.getByRole('button', { name: /new category/i }))
    expect(onSeed).toHaveBeenCalled(); expect(onAdd).toHaveBeenCalled()
  })
  it('hides manager buttons for a viewer', () => {
    render(<BudgetView trip={emptyTrip} canManage={false} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /new category/i })).not.toBeInTheDocument()
  })
  it('is read-only for a viewer on a non-empty budget (no add or per-card edit/remove)', () => {
    render(<BudgetView trip={tripWithCats} canManage={false} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={vi.fn()} />)
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new category/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit meal/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove meal/i })).not.toBeInTheDocument()
  })
})
