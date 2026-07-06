import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpdateTrip', () => ({ useUpdateTrip: vi.fn() }))
import { useUpdateTrip } from '../hooks/useUpdateTrip'
import { EditTripModal } from './EditTripModal'

const trip = { name: 'Tokyo', place: 'Tokyo, Japan', start_date: '2026-07-12', end_date: '2026-07-19' }

beforeEach(() => vi.clearAllMocks())

function setup(fn = vi.fn()) {
  mutate = fn
  useUpdateTrip.mockReturnValue({ mutate, isPending: false })
  render(<EditTripModal onClose={vi.fn()} trip={trip} />)
  return mutate
}

let mutate

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
      expect.objectContaining({ name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' }),
      expect.any(Object),
    )
  })

  it('lets the host change the trip currencies', async () => {
    mutate = vi.fn()
    useUpdateTrip.mockReturnValue({ mutate, isPending: false })
    render(<EditTripModal isOpen trip={{ id: 't1', name: 'Tokyo', place: 'Japan', start_date: '2026-11-08', end_date: '2026-11-15', departure_currency: 'MYR', destination_currency: 'JPY' }} onClose={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText(/destination currency/i), 'THB')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ destination_currency: 'THB' }), expect.any(Object))
  })
})
