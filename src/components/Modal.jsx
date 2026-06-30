import { useEffect, useRef } from 'react'
import styles from './Modal.module.css'

export function Modal({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className={styles.backdrop}
      data-testid="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
      >
        {children}
      </div>
    </div>
  )
}
