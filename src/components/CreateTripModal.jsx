import { useState } from 'react'
import { Modal } from './Modal'
import { useCreateTrip } from '../hooks/useCreateTrip'
import styles from './CreateTripModal.module.css'

const EMPTY = { name: '', place: '', startDate: '', endDate: '' }

export function CreateTripModal({ isOpen, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const { mutate, isPending } = useCreateTrip()

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const { name, place, startDate, endDate } = form
    if (!name.trim() || !place.trim() || !startDate || !endDate) {
      setError('All fields are required.')
      return
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.')
      return
    }
    setError('')
    mutate(
      { name: name.trim(), place: place.trim(), startDate, endDate },
      {
        onSuccess: () => {
          setForm(EMPTY)
          onClose()
        },
        onError: () => setError('Could not create the trip. Please try again.'),
      },
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New trip">
      <form className={styles.pass} onSubmit={handleSubmit}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>NEW BOARDING PASS</p>
          <h2 className={styles.title}>Plan a trip</h2>

          <label className={styles.label} htmlFor="t-name">Trip name</label>
          <input id="t-name" className={styles.input} value={form.name} onChange={set('name')} placeholder="Tokyo Trip" autoFocus />

          <label className={styles.label} htmlFor="t-place">Place</label>
          <input id="t-place" className={styles.input} value={form.place} onChange={set('place')} placeholder="Tokyo, Japan" />

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="t-start">Start date</label>
              <input id="t-start" type="date" className={styles.input} value={form.startDate} onChange={set('startDate')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="t-end">End date</label>
              <input id="t-end" type="date" className={styles.input} value={form.endDate} onChange={set('endDate')} />
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={isPending}>
              {isPending ? 'Creating…' : 'Create trip'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
