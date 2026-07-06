import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetTotals } from './BudgetTotals'

describe('BudgetTotals', () => {
  it('shows budgeted, spent and under/over per currency', () => {
    const totals = { JPY: { budgeted: 40000, spent: 36000, delta: 4000 }, MYR: { budgeted: 0, spent: 50, delta: -50 } }
    render(<BudgetTotals totals={totals} />)
    expect(screen.getByText('In JPY')).toBeInTheDocument()
    expect(screen.getByText('¥36,000')).toBeInTheDocument()      // spent
    expect(screen.getByText('¥40,000')).toBeInTheDocument()      // budgeted
    expect(screen.getByText(/¥4,000 under/i)).toBeInTheDocument()
    expect(screen.getByText(/RM50 over/i)).toBeInTheDocument()
  })
  it('renders nothing when there are no totals', () => {
    const { container } = render(<BudgetTotals totals={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
