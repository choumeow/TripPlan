import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduledCard } from './ScheduledCard'

const card = { title: 'Ichiran', color: '#F59E0B', time: '09:00:00', durationMin: 60 }

describe('ScheduledCard', () => {
  it('renders the time chip and name', () => {
    render(<ScheduledCard card={card} canEdit={false} onSetTime={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()
  })
  it('hides edit affordances for viewers', () => {
    render(<ScheduledCard card={card} canEdit={false} onSetTime={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /set time/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })
  it('lets an editor open the time editor and set a start time', async () => {
    const onSetTime = vi.fn()
    render(<ScheduledCard card={card} canEdit onSetTime={onSetTime} onRemove={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /set time/i }))
    const input = screen.getByLabelText(/start/i)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(input, { target: { value: '10:30' } })
    expect(onSetTime).toHaveBeenCalledWith({ startTime: '10:30' })
  })
  it('removes from the day', async () => {
    const onRemove = vi.fn()
    render(<ScheduledCard card={card} canEdit onSetTime={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
