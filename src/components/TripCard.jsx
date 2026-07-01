import { Link } from 'react-router-dom'
import {
  countdownLabel,
  nights,
  journeyProgress,
  daysToGo,
  tripStatus,
  monthDay,
} from '../lib/tripDates'
import { initials } from '../lib/display'
import { JourneyBar } from './JourneyBar'
import styles from './TripCard.module.css'

// The card is a link to the trip workspace (click/Enter opens it). It flips to the
// back on hover/focus via CSS — no flipped state needed.
export function TripCard({ trip, today, size }) {
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

  return (
    <Link
      to={`/trip/${trip.id}`}
      className={`${styles.card} ${size === 'hero' ? styles.hero : ''}`}
      aria-label={`Open ${trip.name}`}
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
              {monthDay(trip.start_date)} — {monthDay(trip.end_date)} · {nights(trip)} nights
            </p>
            <div className={styles.perf} />
            <span className={styles.badge}>{label}</span>
            <p className={styles.hint}>hover for crew · click to open</p>
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
            <p className={styles.hint}>click to open →</p>
          </div>
        </section>
      </div>
    </Link>
  )
}
