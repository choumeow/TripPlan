import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackingRail } from './PackingRail'

const entries = [
  { id: 'shared', label: 'Shared', glyph: '🎒', tag: null, ghost: false, packed: 1, total: 3 },
  { id: 'you', label: 'Your list', glyph: '🧳', tag: 'Private', ghost: false, packed: 2, total: 4 },
  { id: 'gG', label: 'Grandma', glyph: 'G', tag: 'Ghost', ghost: true, packed: 0, total: 2 },
]

describe('PackingRail', () => {
  it('renders overall progress and a button per entry', () => {
    render(<PackingRail overall={{ packed: 3, total: 9 }} entries={entries} selected="shared" onSelect={vi.fn()} />)
    expect(screen.getByText('3 / 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shared/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /your list/i })).toBeInTheDocument()
    expect(screen.getByText(/ghost travellers/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /grandma/i })).toBeInTheDocument()
  })
  it('omits the ghost group when there are no ghosts', () => {
    render(<PackingRail overall={{ packed: 3, total: 7 }} entries={entries.filter((e) => !e.ghost)} selected="shared" onSelect={vi.fn()} />)
    expect(screen.queryByText(/ghost travellers/i)).not.toBeInTheDocument()
  })
  it('fires onSelect with the entry id', async () => {
    const onSelect = vi.fn()
    render(<PackingRail overall={{ packed: 3, total: 9 }} entries={entries} selected="shared" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /your list/i }))
    expect(onSelect).toHaveBeenCalledWith('you')
  })
})
