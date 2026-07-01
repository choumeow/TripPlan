import { useState } from 'react'
import { Modal } from './Modal'
import { useUpdateTrip } from '../hooks/useUpdateTrip'
import styles from './EditTripModal.module.css'

export function EditTripModal({ onClose, trip }) {
  const [form, setForm] = useState({
    name: trip.name, place: trip.place, startDate: trip.start_date, endDate: trip.end_date,
  })
  const [error, setError] = useState('')
  const { mutate, isPending } = useUpdateTrip(trip.id)

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
      { onSuccess: onClose, onError: () => setError('Could not save changes. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Edit trip">
      <form className={styles.pass} onSubmit={handleSubmit}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>EDIT BOARDING PASS</p>
          <h2 className={styles.title}>Trip details</h2>

          <label className={styles.label} htmlFor="e-name">Trip name</label>
          <input id="e-name" className={styles.input} value={form.name} onChange={set('name')} autoFocus />

          <label className={styles.label} htmlFor="e-place">Place</label>
          <input id="e-place" className={styles.input} value={form.place} onChange={set('place')} />

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="e-start">Start date</label>
              <input id="e-start" type="date" className={styles.input} value={form.startDate} onChange={set('startDate')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="e-end">End date</label>
              <input id="e-end" type="date" className={styles.input} value={form.endDate} onChange={set('endDate')} />
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
