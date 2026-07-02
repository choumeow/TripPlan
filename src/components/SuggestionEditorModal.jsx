import { useState } from 'react'
import { Modal } from './Modal'
import { SUGGESTION_TYPES, suggestionType } from '../lib/suggestionTypes'
import { blankSuggestionForm, formToPlanItem, planItemToForm } from '../lib/planItems'
import { TRANSPORT_METHODS, METHOD_KEYS, methodMeta, rowToForm } from '../lib/transport'
import { useUpsertPlanItem } from '../hooks/useUpsertPlanItem'
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import styles from './SuggestionEditorModal.module.css'

const DAYS = [
  { i: 1, l: 'Mon' }, { i: 2, l: 'Tue' }, { i: 3, l: 'Wed' }, { i: 4, l: 'Thu' },
  { i: 5, l: 'Fri' }, { i: 6, l: 'Sat' }, { i: 0, l: 'Sun' },
]

// Build the initial form: editing a plan item, editing a local transport leg, or a blank of initialType.
function initialForm({ planItem, transportLeg, initialType }) {
  if (planItem) return planItemToForm(planItem)
  if (transportLeg) return { ...blankSuggestionForm('transport'), ...rowToForm(transportLeg), typeKey: 'transport', note: transportLeg.note ?? '' }
  return blankSuggestionForm(initialType ?? 'visit')
}

export function SuggestionEditorModal({ tripId, memberId, onClose, planItem, transportLeg, initialType }) {
  const [form, setForm] = useState(() => initialForm({ planItem, transportLeg, initialType }))
  const [error, setError] = useState('')
  const upsertPlan = useUpsertPlanItem(tripId)
  const upsertTransport = useUpsertTransport(tripId)
  const t = suggestionType(form.typeKey)
  const pending = upsertPlan.isPending || upsertTransport.isPending
  const isEdit = !!form.id
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  const toggleDay = (i) => setForm((f) => ({ ...f, availDays: f.availDays.includes(i) ? f.availDays.filter((d) => d !== i) : [...f.availDays, i] }))

  function fail(msg) { setError(msg); return false }
  function validate() {
    if (!form.title.trim()) return fail('Name is required.')
    if (t.target === 'transport') {
      if (!form.method || !form.from.trim() || !form.to.trim()) return fail('Method, from and to are required.')
      return true
    }
    if (!form.location.trim()) return fail('Location is required.')
    if (t.kind === 'place') {
      if (!form.availDays.length || !form.availOpen || !form.availClose) return fail('Pick at least one open day and open/close times.')
    } else {
      if (!form.checkIn || !form.checkOut) return fail('Check-in and check-out dates are required.')
      if (form.checkOut < form.checkIn) return fail('Check-out must be on or after check-in.')
    }
    return true
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setError('')
    const onDone = { onSuccess: onClose, onError: () => setError('Could not save. Please try again.') }
    if (t.target === 'transport') {
      upsertTransport.mutate({
        ...(form.id ? { id: form.id } : {}),
        category: 'local', direction: null, method: form.method,
        from: form.from.trim(), to: form.to.trim(),
        reference: methodMeta(form.method).ref ? form.reference.trim() : '',
        note: form.note.trim(), createdBy: memberId,
      }, onDone)
    } else {
      upsertPlan.mutate({ ...formToPlanItem(form), createdBy: memberId }, onDone)
    }
  }

  const meta = methodMeta(form.method)

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit suggestion' : 'Add a suggestion'}>
      <form className={styles.pass} noValidate onSubmit={handleSubmit}>
        <div className={styles.colbar} style={{ background: t.color }} />
        <div className={styles.pad}>
          <p className={styles.ey}>{isEdit ? 'EDIT SUGGESTION' : 'NEW SUGGESTION'}</p>

          <label className={styles.label} htmlFor="s-name">Name</label>
          <input id="s-name" className={styles.input} value={form.title} onChange={set('title')} />

          <span className={styles.label} id="type-label">Type</span>
          <div className={styles.chips} role="group" aria-labelledby="type-label">
            {SUGGESTION_TYPES.map((st) => (
              <button key={st.key} type="button"
                className={`${styles.chip} ${form.typeKey === st.key ? styles.chipOn : ''}`}
                style={form.typeKey === st.key ? { borderColor: st.color, color: st.color } : undefined}
                aria-pressed={form.typeKey === st.key}
                onClick={() => { setForm((f) => ({ ...f, typeKey: st.key })); setError('') }}>
                {st.label}
              </button>
            ))}
          </div>

          {t.target === 'transport' ? (
            <>
              <span className={styles.label} id="m-label">Method</span>
              <div className={styles.chips} role="group" aria-labelledby="m-label">
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
                  <label className={styles.label} htmlFor="s-from">{meta.from}</label>
                  <input id="s-from" className={styles.input} value={form.from} onChange={set('from')} />
                </div>
                <div className={styles.col}>
                  <label className={styles.label} htmlFor="s-to">{meta.to}</label>
                  <input id="s-to" className={styles.input} value={form.to} onChange={set('to')} />
                </div>
              </div>
              {meta.ref && (
                <>
                  <label className={styles.label} htmlFor="s-ref">{meta.ref} · optional</label>
                  <input id="s-ref" className={styles.input} value={form.reference} onChange={set('reference')} />
                </>
              )}
              <label className={styles.label} htmlFor="s-note">Note · optional</label>
              <input id="s-note" className={styles.input} value={form.note} onChange={set('note')} />
            </>
          ) : (
            <>
              <label className={styles.label} htmlFor="s-loc">Location</label>
              <input id="s-loc" className={styles.input} value={form.location} onChange={set('location')} />
              <label className={styles.label} htmlFor="s-link">Website / link · optional</label>
              <input id="s-link" className={styles.input} placeholder="place some social media info here" value={form.link} onChange={set('link')} />
              <label className={styles.label} htmlFor="s-desc">Description · optional</label>
              <input id="s-desc" className={styles.input} placeholder="fill in description/purpose to let others know more" value={form.description} onChange={set('description')} />
              <label className={styles.label} htmlFor="s-price">Price range · optional</label>
              <input id="s-price" className={styles.input} value={form.priceRange} onChange={set('priceRange')} />

              {t.kind === 'place' ? (
                <>
                  <span className={styles.label} id="days-label">Open days</span>
                  <div className={styles.chips} role="group" aria-labelledby="days-label">
                    {DAYS.map((d) => (
                      <button key={d.i} type="button"
                        className={`${styles.chip} ${form.availDays.includes(d.i) ? styles.chipOn : ''}`}
                        aria-pressed={form.availDays.includes(d.i)}
                        onClick={() => toggleDay(d.i)}>{d.l}</button>
                    ))}
                  </div>
                  <div className={styles.row}>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-open">Open</label>
                      <input id="s-open" type="time" className={styles.input} value={form.availOpen} onChange={set('availOpen')} />
                    </div>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-close">Close</label>
                      <input id="s-close" type="time" className={styles.input} value={form.availClose} onChange={set('availClose')} />
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-astart">Only from · optional</label>
                      <input id="s-astart" type="date" className={styles.input} value={form.availStart} onChange={set('availStart')} />
                    </div>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-aend">Only until · optional</label>
                      <input id="s-aend" type="date" className={styles.input} value={form.availEnd} onChange={set('availEnd')} />
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.row}>
                  <div className={styles.col}>
                    <label className={styles.label} htmlFor="s-in">Check-in</label>
                    <input id="s-in" type="date" className={styles.input} value={form.checkIn} onChange={set('checkIn')} />
                  </div>
                  <div className={styles.col}>
                    <label className={styles.label} htmlFor="s-out">Check-out</label>
                    <input id="s-out" type="date" className={styles.input} value={form.checkOut} onChange={set('checkOut')} />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={pending}>
              {pending ? 'Saving…' : 'Save suggestion'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
