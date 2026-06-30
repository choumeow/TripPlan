import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

beforeEach(() => vi.clearAllMocks())

describe('Modal', () => {
  it('renders children only when open', () => {
    const { rerender } = render(
      <Modal isOpen={false} onClose={() => {}} title="New trip"><p>Body</p></Modal>,
    )
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
    rerender(<Modal isOpen onClose={() => {}} title="New trip"><p>Body</p></Modal>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('closes on Escape and backdrop click', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} title="New trip"><p>Body</p></Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
