import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeEditor } from './TimeEditor'

describe('TimeEditor', () => {
  it('emits a startTime patch on change', () => {
    const onChange = vi.fn()
    render(<TimeEditor time="09:00:00" durationMin={60} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: '10:30' } })
    expect(onChange).toHaveBeenCalledWith({ startTime: '10:30' })
  })
  it('emits a durationMin patch on change', () => {
    const onChange = vi.fn()
    render(<TimeEditor time="09:00:00" durationMin={60} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/min/i), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith({ durationMin: 90 })
  })
  it('hides duration when durationDisabled', () => {
    render(<TimeEditor time="09:00:00" durationMin={null} durationDisabled onChange={vi.fn()} />)
    expect(screen.queryByLabelText(/min/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/start/i)).toBeInTheDocument()
  })
})
