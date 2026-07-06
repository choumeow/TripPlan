import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetTotals } from './BudgetTotals'

describe('BudgetTotals', () => {
  it('shows budgeted, spent and under/over per currency', () => {
    const totals = { JPY: { budgeted: 40000, spent: 36000, delta: 4000 }, MYR: { budgeted: 30, spent: 50, delta: -20 } }
    render(<BudgetTotals totals={totals} />)
    expect(screen.getByText('In JPY')).toBeInTheDocument()
    expect(screen.getByText('¥36,000')).toBeInTheDocument()      // spent
    expect(screen.getByText('¥40,000')).toBeInTheDocument()      // budgeted
    expect(screen.getByText('Under by')).toBeInTheDocument()
    expect(screen.getByText('¥4,000')).toBeInTheDocument()       // delta, no doubled "under"
    expect(screen.getByText('Over by')).toBeInTheDocument()
    expect(screen.getByText('RM20')).toBeInTheDocument()         // delta, no doubled "over"
  })
  it('renders nothing when there are no totals', () => {
    const { container } = render(<BudgetTotals totals={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
