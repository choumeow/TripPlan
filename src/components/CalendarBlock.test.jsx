import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { CalendarBlock } from './CalendarBlock'

const card = { dndId: 'plan:b', title: 'Ichiran', color: '#F59E0B', time: '09:00:00', durationMin: 60, source: 'plan' }

function renderBlock(props) {
  return render(
    <DndContext>
      <CalendarBlock card={card} style={{}} canEdit onSetTime={vi.fn()} onRemove={vi.fn()} {...props} />
    </DndContext>,
  )
}

describe('CalendarBlock', () => {
  it('renders the time range and title', () => {
    renderBlock()
    expect(screen.getByText(/09:00.*10:00/)).toBeInTheDocument()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()
  })
  // NOTE: fireEvent.click (a raw click) is used instead of userEvent.click because
  // @dnd-kit's default PointerSensor in a bare <DndContext> swallows the pointerdown that
  // userEvent.click dispatches, suppressing the synthetic click. In production the block sits
  // under Planning's delay-activation sensors, so a real quick click fires normally.
  it('opens the time editor on click and forwards the patch', () => {
    const onSetTime = vi.fn()
    renderBlock({ onSetTime })
    fireEvent.click(screen.getByText('Ichiran'))
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: '11:00' } })
    expect(onSetTime).toHaveBeenCalledWith({ startTime: '11:00' })
  })
  it('unschedules via the remove button', () => {
    const onRemove = vi.fn()
    renderBlock({ onRemove })
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
  it('hides affordances for viewers', () => {
    renderBlock({ canEdit: false })
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })
})
