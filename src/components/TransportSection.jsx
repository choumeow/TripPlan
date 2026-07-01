import { useState } from 'react'
import { monthDay } from '../lib/tripDates'
import { blankLeg, rowToForm, methodMeta } from '../lib/transport'
import { TransportEditorModal } from './TransportEditorModal'
import { useDeleteTransport } from '../hooks/useDeleteTransport'
import styles from './TransportSection.module.css'

const GROUPS = [
  { direction: 'outbound', label: 'Getting there', icon: '🌍', empty: 'Add your outbound transport' },
  { direction: 'return', label: 'Getting back', icon: '🏠', empty: 'Add your return transport' },
]

function sortLegs(a, b) {
  return (
    (a.depart_date ?? '').localeCompare(b.depart_date ?? '') ||
    (a.depart_time ?? '').localeCompare(b.depart_time ?? '') ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '')
  )
}

function legMeta(leg) {
  return [monthDay(leg.depart_date), leg.depart_time, methodMeta(leg.method).label, leg.reference]
    .filter(Boolean)
    .join(' · ')
}

export function TransportSection({ trip, canEdit, memberId }) {
  const [editor, setEditor] = useState(null)
  const del = useDeleteTransport(trip.id)
  const legs = (trip.transport ?? []).filter((t) => t.category === 'journey')

  function defaultDate(direction) {
    return direction === 'return' ? trip.end_date : trip.start_date
  }
  function remove(leg) {
    if (window.confirm('Remove this transport leg?')) del.mutate(leg.id)
  }

  return (
    <section className={styles.wrap}>
      <h2 className={styles.h2}>Transport</h2>
      {GROUPS.map((g) => {
        const items = legs.filter((l) => l.direction === g.direction).slice().sort(sortLegs)
        return (
          <div key={g.direction} className={styles.group}>
            <div className={styles.head}>
              <span className={styles.title}>
                <span aria-hidden="true">{g.icon}</span> {g.label}
              </span>
              {canEdit && (
                <button type="button" className={styles.add}
                  onClick={() => setEditor({ initial: blankLeg(g.direction, defaultDate(g.direction)) })}>
                  + Add
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className={styles.empty}>{canEdit ? g.empty : 'No transport yet'}</p>
            ) : (
              <ul className={styles.list}>
                {items.map((l) => (
                  <li key={l.id} className={styles.leg}>
                    <span className={styles.icon} aria-hidden="true">{methodMeta(l.method).icon}</span>
                    <div className={styles.main}>
                      <p className={styles.route}>{l.from_text} → {l.to_text}</p>
                      <p className={styles.meta}>{legMeta(l)}</p>
                    </div>
                    {canEdit && (
                      <div className={styles.act}>
                        <button type="button" className={styles.iconBtn}
                          aria-label={`Edit ${l.from_text} to ${l.to_text}`}
                          onClick={() => setEditor({ initial: rowToForm(l) })}>✎</button>
                        <button type="button" className={styles.iconBtn}
                          aria-label={`Remove ${l.from_text} to ${l.to_text}`}
                          onClick={() => remove(l)}>✕</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {editor && (
        <TransportEditorModal
          tripId={trip.id}
          initial={editor.initial}
          createdBy={memberId}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  )
}
