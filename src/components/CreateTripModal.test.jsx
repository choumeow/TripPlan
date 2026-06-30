import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useCreateTrip', () => ({ useCreateTrip: vi.fn() }))
import { useCreateTrip } from '../hooks/useCreateTrip'
import { CreateTripModal } from './CreateTripModal'

beforeEach(() => vi.clearAllMocks())

function setup(mutate = vi.fn()) {
  useCreateTrip.mockReturnValue({ mutate, isPending: false, isError: false })
  render(<CreateTripModal isOpen onClose={vi.fn()} />)
  return mutate
}

// Use fireEvent.change — userEvent.type does not reliably drive type="date" in jsdom.
function fill({ name, place, start, end }) {
  if (name !== undefined)
    fireEvent.change(screen.getByLabelText(/trip name/i), { target: { value: name } })
  if (place !== undefined)
    fireEvent.change(screen.getByLabelText(/place/i), { target: { value: place } })
  if (start !== undefined)
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: start } })
  if (end !== undefined)
    fireEvent.change(screen.getByLabelText(/end/i), { target: { value: end } })
}

describe('CreateTripModal', () => {
  it('blocks submit until all fields are filled', async () => {
    const mutate = setup()
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/all fields are required/i)).toBeInTheDocument()
  })

  it('blocks submit when end is before start', async () => {
    const mutate = setup()
    fill({ name: 'Tokyo', place: 'Tokyo', start: '2026-07-19', end: '2026-07-12' })
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument()
  })

  it('submits a valid trip', async () => {
    const mutate = setup()
    fill({ name: 'Tokyo', place: 'Tokyo, Japan', start: '2026-07-12', end: '2026-07-19' })
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(mutate).toHaveBeenCalledWith(
      { name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' },
      expect.any(Object),
    )
  })
})
