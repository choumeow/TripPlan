import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutate = vi.fn()
vi.mock('../hooks/useUpsertCategory', () => ({ useUpsertCategory: () => ({ mutate, isPending: false }) }))
import { CategoryEditorModal } from './CategoryEditorModal'

const trip = { id: 't1', departure_currency: 'MYR', destination_currency: 'JPY' }
beforeEach(() => vi.clearAllMocks())

describe('CategoryEditorModal', () => {
  it('blocks save without a name', async () => {
    render(<CategoryEditorModal tripId="t1" trip={trip} memberId="m1" category={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /save category/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
  })
  it('saves name + the two currency budgets (blank = empty)', async () => {
    render(<CategoryEditorModal tripId="t1" trip={trip} memberId="m1" category={null} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/category name/i), 'Meal')
    await userEvent.type(screen.getByLabelText(/destination budget/i), '40000')
    await userEvent.click(screen.getByRole('button', { name: /save category/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Meal', budgets: { MYR: '', JPY: '40000' }, createdBy: 'm1' }),
      expect.any(Object),
    )
  })
  it('prefills on edit and keeps the id', async () => {
    const category = { id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }
    render(<CategoryEditorModal tripId="t1" trip={trip} memberId="m1" category={category} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/category name/i)).toHaveValue('Meal')
    expect(screen.getByLabelText(/destination budget/i)).toHaveValue(40000)
    await userEvent.click(screen.getByRole('button', { name: /save category/i }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', name: 'Meal' }), expect.any(Object))
  })
})
