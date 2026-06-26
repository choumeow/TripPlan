import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dashboard } from './Dashboard'

describe('Dashboard', () => {
  it('renders the trips heading and an empty state', () => {
    render(<Dashboard />)
    expect(
      screen.getByRole('heading', { name: /your trips/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no trips yet/i)).toBeInTheDocument()
  })
})
