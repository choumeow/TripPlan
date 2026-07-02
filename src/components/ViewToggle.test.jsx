import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewToggle } from './ViewToggle'

describe('ViewToggle', () => {
  it('renders the three views and marks the active one', () => {
    render(<ViewToggle view="board" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Thread' })).toBeInTheDocument()
  })
  it('calls onChange with the chosen view', async () => {
    const onChange = vi.fn()
    render(<ViewToggle view="board" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(onChange).toHaveBeenCalledWith('calendar')
  })
})
