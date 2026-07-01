import { Link } from 'react-router-dom'
import { nights, monthDay } from '../lib/tripDates'
import styles from './TripSubHeader.module.css'

export function TripSubHeader({ trip }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.accent} style={{ background: trip.accent_color }} />
      <div className={styles.bar}>
        <Link to="/" className={styles.back}>← Trips</Link>
        <div className={styles.info}>
          <h1 className={styles.name}>{trip.name}</h1>
          <p className={styles.meta}>
            <span className={styles.dot} /> {trip.place} · {monthDay(trip.start_date)} — {monthDay(trip.end_date)} · {nights(trip)} nights
          </p>
        </div>
        <span className={styles.code}>{trip.code}</span>
      </div>
    </div>
  )
}
