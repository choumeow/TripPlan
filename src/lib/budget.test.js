import { describe, it, expect } from 'vitest'
import { categoryRows, uncategorizedRows, budgetTotals, STARTER_CATEGORIES } from './budget'

const cat = { id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }
const team = [
  { category_id: 'c1', currency: 'JPY', total_amount: 31000 },
  { category_id: 'c1', currency: 'MYR', total_amount: 50 },   // spend in a currency with no budget
  { category_id: null, currency: 'JPY', total_amount: 5000 }, // uncategorized
]

describe('categoryRows', () => {
  it('returns a row per budgeted-or-spent currency, budgeted first, with null budget when unset', () => {
    const rows = categoryRows(cat, team)
    expect(rows).toEqual([
      { currency: 'JPY', spent: 31000, budget: 40000 },
      { currency: 'MYR', spent: 50, budget: null },
    ])
  })
  it('is empty for a category with no budget and no spend', () => {
    expect(categoryRows({ id: 'c9', name: 'X', category_budgets: [] }, team)).toEqual([])
  })
})
describe('uncategorizedRows', () => {
  it('sums team spend with no category by currency', () => {
    expect(uncategorizedRows(team)).toEqual([{ currency: 'JPY', spent: 5000 }])
  })
})
describe('budgetTotals', () => {
  it('sums budgeted per currency and ALL team spend per currency, with delta', () => {
    const totals = budgetTotals([cat], team)
    expect(totals.JPY).toEqual({ budgeted: 40000, spent: 36000, delta: 4000 })
    expect(totals.MYR).toEqual({ budgeted: 0, spent: 50, delta: -50 })
  })
})
describe('STARTER_CATEGORIES', () => {
  it('is the five example names', () => {
    expect(STARTER_CATEGORIES).toEqual(['Hostel', 'Meal', 'Transport', 'Ticket', 'Photograph'])
  })
})
