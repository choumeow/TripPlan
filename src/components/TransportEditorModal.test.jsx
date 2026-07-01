import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpsertTransport', () => ({ useUpsertTransport: vi.fn() }))
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import { TransportEditorModal } from './TransportEditorModal'

const initial = {
  direction: 'outbound', method: 'flight', departDate: '2026-07-12', departTime: '',
  from: '', to: '', reference: '',
}

beforeEach(() => vi.clearAllMocks())

function setup(mutate = vi.fn(), init = initial) {
  useUpsertTransport.mockReturnValue({ mutate, isPending: false })
  render(<TransportEditorModal onClose={vi.fn()} tripId="t1" initial={init} createdBy="m1" />)
  return mutate
}

describe('TransportEditorModal', () => {
  it('labels the fields for the flight method', () => {
    setup()
    expect(screen.getByLabelText(/from airport/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/to airport/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/flight no/i)).toBeInTheDocument()
  })

  it('relabels the fields when the method changes to bus', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /bus/i }))
    expect(screen.getByLabelText(/from terminal/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/operator/i)).toBeInTheDocument()
  })

  it('hides the reference field for car', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /car/i }))
    expect(screen.queryByLabelText(/flight no/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/operator/i)).not.toBeInTheDocument()
  })

  it('blocks save when from/to are empty', async () => {
    const mutate = setup()
    await userEvent.click(screen.getByRole('button', { name: /save leg/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/from and to are required/i)).toBeInTheDocument()
  })

  it('submits the leg with createdBy', async () => {
    const mutate = setup()
    fireEvent.change(screen.getByLabelText(/from airport/i), { target: { value: 'KLIA2' } })
    fireEvent.change(screen.getByLabelText(/to airport/i), { target: { value: 'Haneda' } })
    await userEvent.click(screen.getByRole('button', { name: /save leg/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'outbound', method: 'flight', from: 'KLIA2', to: 'Haneda', createdBy: 'm1' }),
      expect.any(Object),
    )
  })
})
