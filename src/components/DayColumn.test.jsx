import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { DayColumn } from './DayColumn'

function renderCol(cards) {
  return render(
    <DndContext>
      <DayColumn date="2026-07-03" label="Day 1 · JUL 03" cards={cards} canEdit
        onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('DayColumn', () => {
  it('renders its header and each scheduled card', () => {
    renderCol([
      { dndId: 'plan:b', title: 'B', color: '#0EA5E9', time: '09:00:00' },
      { dndId: 'plan:c', title: 'C', color: '#22C55E', time: null },
    ])
    expect(screen.getByText('Day 1 · JUL 03')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })
  it('shows a drop placeholder when empty', () => {
    renderCol([])
    expect(screen.getByText(/drop a suggestion here/i)).toBeInTheDocument()
  })
})
