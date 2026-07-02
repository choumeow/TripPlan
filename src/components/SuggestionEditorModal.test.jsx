import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpsertPlanItem', () => ({ useUpsertPlanItem: vi.fn() }))
vi.mock('../hooks/useUpsertTransport', () => ({ useUpsertTransport: vi.fn() }))

import { useUpsertPlanItem } from '../hooks/useUpsertPlanItem'
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import { SuggestionEditorModal } from './SuggestionEditorModal'

beforeEach(() => {
  vi.clearAllMocks()
  useUpsertPlanItem.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useUpsertTransport.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

function open(props) {
  render(<SuggestionEditorModal tripId="t1" memberId="m1" initialType="visit" onClose={vi.fn()} {...props} />)
}

describe('SuggestionEditorModal', () => {
  it('blocks a place save when required fields are missing', async () => {
    const mutate = vi.fn()
    useUpsertPlanItem.mockReturnValue({ mutate, isPending: false })
    open()
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('saves a valid place to plan_items with mapped fields', async () => {
    const mutate = vi.fn()
    useUpsertPlanItem.mockReturnValue({ mutate, isPending: false })
    open()
    await userEvent.type(screen.getByLabelText(/^name/i), 'Senso-ji')
    await userEvent.type(screen.getByLabelText(/location/i), 'Asakusa')
    await userEvent.click(screen.getByRole('button', { name: /^mon$/i }))
    fireEvent.change(screen.getByLabelText(/^open$/i), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText(/^close$/i), { target: { value: '17:00' } })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'place', category: 'visit', title: 'Senso-ji', location: 'Asakusa', createdBy: 'm1' }),
      expect.any(Object),
    )
  })

  it('switches to Transport and saves a local leg to the transport table', async () => {
    const mutate = vi.fn()
    useUpsertTransport.mockReturnValue({ mutate, isPending: false })
    open()
    await userEvent.type(screen.getByLabelText(/^name/i), 'Subway hop')
    await userEvent.click(screen.getByRole('button', { name: /^transport$/i }))
    await userEvent.type(screen.getByLabelText(/from/i), 'Asakusa Stn')
    await userEvent.type(screen.getByLabelText(/^to/i), 'Shibuya Stn')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'local', direction: null, from: 'Asakusa Stn', to: 'Shibuya Stn', createdBy: 'm1' }),
      expect.any(Object),
    )
  })
})
