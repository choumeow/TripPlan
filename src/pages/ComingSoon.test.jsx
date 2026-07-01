import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  it('names the section that is coming soon', () => {
    render(<ComingSoon section="Planning" />)
    expect(screen.getByText(/planning is coming soon/i)).toBeInTheDocument()
  })
})
