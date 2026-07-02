import { useState } from 'react'
import { SuggestionCard } from './SuggestionCard'
import { categoryMeta } from '../lib/placeCategories'
import { availabilityMatches, availabilityLabel } from '../lib/planItems'
import { methodMeta } from '../lib/transport'
import styles from './PlanningBacklog.module.css'

const STAY_COLOR = '#22C55E'
const TRANSPORT_COLOR = '#14B8A6'

function memberName(trip, id) {
  const m = (trip.trip_members ?? []).find((x) => x.id === id)
  return m ? (m.profiles?.display_name ?? m.display_name ?? 'Guest') : '—'
}

function planItemCard(trip, item, date, time) {
  const isPlace = item.kind === 'place'
  const meta = isPlace ? categoryMeta(item.category) : { label: 'Stay', color: STAY_COLOR }
  const rows = [
    item.location && { k: 'Location', v: item.location },
    item.price_range && { k: 'Price', v: item.price_range },
    item.link && { k: 'Link', v: item.link },
    item.description && { k: 'Notes', v: item.description },
    item.check_in_date && { k: 'Check-in', v: item.check_in_date },
    item.check_out_date && { k: 'Check-out', v: item.check_out_date },
  ].filter(Boolean)
  const availLabel = availabilityLabel(item)
  return {
    key: item.id, source: 'plan', raw: item,
    title: item.title, pillLabel: meta.label, color: meta.color,
    availLabel, showAvail: !!date && !!availLabel,
    matches: availabilityMatches(item, date, time),
    createdByName: memberName(trip, item.created_by), rows,
  }
}

function transportCard(trip, leg) {
  const meta = methodMeta(leg.method)
  const rows = [
    { k: 'Route', v: `${leg.from_text} → ${leg.to_text}` },
    leg.reference && { k: 'Reference', v: leg.reference },
    leg.note && { k: 'Notes', v: leg.note },
  ].filter(Boolean)
  return {
    key: leg.id, source: 'transport', raw: leg,
    title: `${leg.from_text} → ${leg.to_text}`, pillLabel: meta.label, color: TRANSPORT_COLOR,
    availLabel: '', showAvail: false, matches: true,
    createdByName: memberName(trip, leg.created_by), rows,
  }
}

export function PlanningBacklog({ trip, canEdit, onAdd, onEdit, onRemove }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const items = trip.plan_items ?? []
  const locals = (trip.transport ?? []).filter((t) => t.category === 'local')

  const groups = [
    { key: 'places', icon: '📍', label: 'Places', addType: 'visit',
      cards: items.filter((i) => i.kind === 'place').map((i) => planItemCard(trip, i, date, time)) },
    { key: 'stays', icon: '🏨', label: 'Stays', addType: 'stay',
      cards: items.filter((i) => i.kind === 'hostel').map((i) => planItemCard(trip, i, date, time)) },
    { key: 'transport', icon: '🚆', label: 'Local transport', addType: 'transport',
      cards: locals.map((l) => transportCard(trip, l)) },
  ]

  return (
    <section>
      <div className={styles.bar}>
        <label className={styles.blabel} htmlFor="f-date">Available on</label>
        <input id="f-date" type="date" className={styles.binput} min={trip.start_date} max={trip.end_date}
          value={date} onChange={(e) => setDate(e.target.value)} />
        <label className={styles.blabel} htmlFor="f-time">at</label>
        <input id="f-time" type="time" className={styles.binput} value={time} onChange={(e) => setTime(e.target.value)} />
        {(date || time) && (
          <button type="button" className={styles.clear} onClick={() => { setDate(''); setTime('') }}>Clear filter</button>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.key} className={styles.group}>
          <div className={styles.head}>
            <span className={styles.gtitle}><span aria-hidden="true">{g.icon}</span> {g.label} ({g.cards.length})</span>
            {canEdit && <button type="button" className={styles.add} onClick={() => onAdd(g.addType)}>+ Add</button>}
          </div>
          {g.cards.length === 0 ? (
            <p className={styles.empty}>{canEdit ? `Add your first ${g.label.toLowerCase()}` : 'Nothing here yet'}</p>
          ) : (
            <div className={styles.grid}>
              {g.cards.map((card) => (
                <SuggestionCard key={card.key} card={card} canEdit={canEdit}
                  onEdit={() => onEdit(card.source, card.raw)} onRemove={() => onRemove(card.source, card.raw)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
