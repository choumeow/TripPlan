import { useState } from 'react'
import { Modal } from './Modal'
import { currencyMeta } from '../lib/currencies'
import { useUpsertCategory } from '../hooks/useUpsertCategory'
import styles from './CategoryEditorModal.module.css'

export function CategoryEditorModal({ tripId, trip, memberId, category, onClose }) {
  const dep = trip.departure_currency ?? 'MYR'
  const dest = trip.destination_currency ?? 'JPY'
  const isEdit = !!category?.id
  const budgetFor = (cur) => {
    const row = (category?.category_budgets ?? []).find((b) => b.currency === cur)
    return row ? String(row.amount) : ''
  }
  const [name, setName] = useState(category?.name ?? '')
  const [depAmt, setDepAmt] = useState(budgetFor(dep))
  const [destAmt, setDestAmt] = useState(budgetFor(dest))
  const [error, setError] = useState('')
  const upsert = useUpsertCategory(tripId)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('A category name is required.'); return }
    setError('')
    upsert.mutate(
      { ...(isEdit ? { id: category.id } : {}), name: name.trim(), budgets: { [dep]: depAmt, [dest]: destAmt }, createdBy: memberId },
      { onSuccess: onClose, onError: () => setError('Could not save. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit category' : 'New category'}>
      <form className={styles.pad} noValidate onSubmit={handleSubmit}>
        <p className={styles.ey}>{isEdit ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</p>

        <label className={styles.label} htmlFor="bc-name">Category name</label>
        <input id="bc-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />

        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="bc-dep">Departure budget · {dep} ({currencyMeta(dep).symbol}) · optional</label>
            <input id="bc-dep" type="number" min="0" step="0.01" className={styles.input} value={depAmt} onChange={(e) => setDepAmt(e.target.value)} />
          </div>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="bc-dest">Destination budget · {dest} ({currencyMeta(dest).symbol}) · optional</label>
            <input id="bc-dest" type="number" min="0" step="0.01" className={styles.input} value={destAmt} onChange={(e) => setDestAmt(e.target.value)} />
          </div>
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submit} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save category'}</button>
        </div>
      </form>
    </Modal>
  )
}
