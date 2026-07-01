import { useState } from 'react'
import { Modal } from './Modal'
import { TRANSPORT_METHODS, METHOD_KEYS, methodMeta } from '../lib/transport'
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import styles from './TransportEditorModal.module.css'

const DIRECTIONS = [
  { key: 'outbound', label: 'Outbound' },
  { key: 'return', label: 'Return' },
]

export function TransportEditorModal({ onClose, tripId, initial, createdBy }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const { mutate, isPending } = useUpsertTransport(tripId)
  const meta = methodMeta(form.method)
  const isEdit = !!form.id

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.method || !form.from.trim() || !form.to.trim()) {
      setError('Method, from and to are required.')
      return
    }
    setError('')
    mutate(
      { ...form, from: form.from.trim(), to: form.to.trim(), reference: methodMeta(form.method).ref ? form.reference.trim() : '', createdBy },
      { onSuccess: onClose, onError: () => setError('Could not save this leg. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit transport' : 'Add transport'}>
      <form className={styles.pass} onSubmit={handleSubmit}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>{isEdit ? 'EDIT LEG' : 'NEW LEG'}</p>
          <h2 className={styles.title}>{form.direction === 'return' ? 'Getting back' : 'Getting there'}</h2>

          <span className={styles.label} id="dir-label">Direction</span>
          <div className={styles.toggle} role="group" aria-labelledby="dir-label">
            {DIRECTIONS.map((d) => (
              <button key={d.key} type="button"
                className={`${styles.toggleBtn} ${form.direction === d.key ? styles.toggleOn : ''}`}
                aria-pressed={form.direction === d.key}
                onClick={() => setForm((f) => ({ ...f, direction: d.key }))}>
                {d.label}
              </button>
            ))}
          </div>

          <span className={styles.label} id="method-label">Method</span>
          <div className={styles.chips} role="group" aria-labelledby="method-label">
            {METHOD_KEYS.map((k) => (
              <button key={k} type="button"
                className={`${styles.chip} ${form.method === k ? styles.chipOn : ''}`}
                aria-pressed={form.method === k}
                onClick={() => setForm((f) => ({ ...f, method: k }))}>
                <span aria-hidden="true">{TRANSPORT_METHODS[k].icon}</span> {TRANSPORT_METHODS[k].label}
              </button>
            ))}
          </div>

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-date">Depart date</label>
              <input id="tr-date" type="date" className={styles.input} value={form.departDate} onChange={set('departDate')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-time">Depart time · optional</label>
              <input id="tr-time" type="time" className={styles.input} value={form.departTime} onChange={set('departTime')} />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-from">{meta.from}</label>
              <input id="tr-from" className={styles.input} value={form.from} onChange={set('from')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-to">{meta.to}</label>
              <input id="tr-to" className={styles.input} value={form.to} onChange={set('to')} />
            </div>
          </div>

          {meta.ref && (
            <>
              <label className={styles.label} htmlFor="tr-ref">{meta.ref} · optional</label>
              <input id="tr-ref" className={styles.input} value={form.reference} onChange={set('reference')} />
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save leg'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
