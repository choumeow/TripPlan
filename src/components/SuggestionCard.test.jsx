import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestionCard } from './SuggestionCard'

const card = {
  key: 'p1', title: 'Ichiran Ramen', pillLabel: 'Meal', color: '#F59E0B',
  availLabel: 'Daily · 11:00–23:00', showAvail: true, matches: true, createdByName: 'Ana',
  rows: [{ k: 'Location', v: 'Shibuya' }, { k: 'Price', v: '¥1,000–2,000' }],
}

describe('SuggestionCard', () => {
  it('renders front (name, pill, creator) and the back detail rows', () => {
    render(<SuggestionCard card={card} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Ichiran Ramen')).toBeInTheDocument()
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Shibuya')).toBeInTheDocument()
    // availability appears on the front (because filtering) AND on the back (full details)
    expect(screen.getAllByText(/Daily · 11:00–23:00/)).toHaveLength(2)
  })
  it('drops the front availability line when not filtering, but keeps it on the back', () => {
    render(<SuggestionCard card={{ ...card, showAvail: false }} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getAllByText(/Daily · 11:00–23:00/)).toHaveLength(1)
  })
  it('shows edit/remove only for editors and fires the handlers', async () => {
    const onEdit = vi.fn(); const onRemove = vi.fn()
    const { rerender } = render(<SuggestionCard card={card} canEdit={false} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    rerender(<SuggestionCard card={card} canEdit onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onEdit).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalled()
  })
})
