import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JourneyBar } from './JourneyBar'

describe('JourneyBar', () => {
  it('renders the label and a progressbar with clamped value', () => {
    render(<JourneyBar progress={0.5} label="12 days" />)
    expect(screen.getByText('12 days')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '50')
  })

  it('clamps progress above 1 to 100', () => {
    render(<JourneyBar progress={1.4} label="go" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
