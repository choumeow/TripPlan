import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripTabs } from './TripTabs'

describe('TripTabs', () => {
  it('renders all five section tabs', () => {
    render(<MemoryRouter initialEntries={['/trip/t1/overview']}><TripTabs /></MemoryRouter>)
    for (const name of ['Overview', 'Planning', 'Packing', 'Finance', 'Discussion']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })
})
