import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpdateTrip', () => ({ useUpdateTrip: vi.fn() }))
import { useUpdateTrip } from '../hooks/useUpdateTrip'
import { EditTripModal } from './EditTripModal'

const trip = { name: 'Tokyo', place: 'Tokyo, Japan', start_date: '2026-07-12', end_date: '2026-07-19' }

beforeEach(() => vi.clearAllMocks())

function setup(mutate = vi.fn()) {
  useUpdateTrip.mockReturnValue({ mutate, isPending: false })
  render(<EditTripModal onClose={vi.fn()} trip={trip} />)
  return mutate
}

describe('EditTripModal', () => {
  it('pre-fills the form from the trip', () => {
    setup()
    expect(screen.getByLabelText(/trip name/i)).toHaveValue('Tokyo')
    expect(screen.getByLabelText(/place/i)).toHaveValue('Tokyo, Japan')
    expect(screen.getByLabelText(/start/i)).toHaveValue('2026-07-12')
  })

  it('blocks an empty name', async () => {
    const mutate = setup()
    fireEvent.change(screen.getByLabelText(/trip name/i), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/all fields are required/i)).toBeInTheDocument()
  })

  it('blocks end before start', async () => {
    const mutate = setup()
    fireEvent.change(screen.getByLabelText(/end/i), { target: { value: '2026-07-01' } })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument()
  })

  it('submits mapped values', async () => {
    const mutate = setup()
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(
      { name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' },
      expect.any(Object),
    )
  })
})
