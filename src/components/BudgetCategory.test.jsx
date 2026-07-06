import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetCategory } from './BudgetCategory'

const category = { id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }
const team = [
  { category_id: 'c1', currency: 'JPY', total_amount: 31000 },
  { category_id: 'c1', currency: 'MYR', total_amount: 50 }, // spend, no budget
]

describe('BudgetCategory', () => {
  it('shows a sub-bar per currency: budgeted (spent/budget) and spend-only ("no budget set")', () => {
    render(<BudgetCategory category={category} teamExpenses={team} canManage={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText('¥31,000 / ¥40,000')).toBeInTheDocument()
    expect(screen.getByText(/no budget set/i)).toBeInTheDocument() // MYR
  })
  it('flags over budget', () => {
    const over = [{ category_id: 'c1', currency: 'JPY', total_amount: 45000 }]
    render(<BudgetCategory category={category} teamExpenses={over} canManage={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/over budget/i)).toBeInTheDocument()
  })
  it('shows a "set a budget" prompt when there is no budget and no spend', () => {
    render(<BudgetCategory category={{ id: 'c9', name: 'Photograph', category_budgets: [] }} teamExpenses={team} canManage onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/set a budget/i)).toBeInTheDocument()
  })
  it('shows edit/remove only when canManage', async () => {
    const onEdit = vi.fn(), onRemove = vi.fn()
    const { rerender } = render(<BudgetCategory category={category} teamExpenses={team} canManage={false} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit meal/i })).not.toBeInTheDocument()
    rerender(<BudgetCategory category={category} teamExpenses={team} canManage onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit meal/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove meal/i }))
    expect(onEdit).toHaveBeenCalledWith(category); expect(onRemove).toHaveBeenCalledWith(category)
  })
})
