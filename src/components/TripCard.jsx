import { useState } from 'react'
import {
  countdownLabel,
  nights,
  journeyProgress,
  daysToGo,
  tripStatus,
} from '../lib/tripDates'
import { JourneyBar } from './JourneyBar'
import styles from './TripCard.module.css'

function fmt(dateStr) {
  const [, m, d] = dateStr.split('-')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${months[Number(m) - 1]} ${d}`
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export function TripCard({ trip, today, size }) {
  const [flipped, setFlipped] = useState(false)
  const members = trip.trip_members ?? []
  const label = countdownLabel(trip, today)
  // Short, distinct label for the journey bar (front badge shows the full label).
  const status = tripStatus(trip, today)
  const shortLabel =
    status === 'upcoming'
      ? `${daysToGo(trip, today)} days`
      : status === 'current'
        ? 'In progress'
        : 'Completed'

  function toggle() {
    setFlipped((f) => !f)
  }
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <div
      className={`${styles.card} ${size === 'hero' ? styles.hero : ''} ${flipped ? styles.flipped : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${trip.name}. Tap to flip.`}
      onClick={toggle}
      onKeyDown={onKey}
    >
      <div className={styles.inner}>
        <section className={styles.front}>
          <span className={styles.colbar} style={{ background: trip.accent_color }} />
          <div className={styles.pad}>
            <div className={styles.ey}>
              <span>BOARDING PASS</span>
              <span className={styles.code}>{trip.code}</span>
            </div>
            <h3 className={styles.dest}>{trip.name}</h3>
            <p className={styles.place}>
              <span className={styles.dot} /> {trip.place}
            </p>
            <p className={styles.dates}>
              {fmt(trip.start_date)} — {fmt(trip.end_date)} · {nights(trip)} nights
            </p>
            <div className={styles.perf} />
            <span className={styles.badge}>{label}</span>
            <p className={styles.hint}>⟲ tap to flip</p>
          </div>
        </section>

        <section className={styles.back}>
          <span className={styles.colbar} style={{ background: trip.accent_color }} />
          <div className={styles.pad}>
            <p className={styles.bktitle}>{members.length} Travellers</p>
            <JourneyBar progress={journeyProgress(trip, today)} label={shortLabel} />
            <div className={styles.scrollwrap}>
              <ul className={styles.clist}>
                {members.map((m) => (
                  <li key={m.id}>
                    <span className={styles.av} style={{ background: trip.accent_color }}>
                      {initials(m.profiles?.display_name ?? m.display_name)}
                    </span>
                    {m.profiles?.display_name ?? m.display_name ?? 'Guest'}
                    <span className={`${styles.tag} ${m.role === 'host' ? styles.host : ''}`}>
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className={styles.hint}>⟲ tap to flip back</p>
          </div>
        </section>
      </div>
    </div>
  )
}
