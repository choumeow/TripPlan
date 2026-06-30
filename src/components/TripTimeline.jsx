import { arrangeTimeline } from '../lib/tripDates'
import { TripCard } from './TripCard'
import styles from './TripTimeline.module.css'

export function TripTimeline({ trips, today }) {
  const { previous, hero, future } = arrangeTimeline(trips, today)
  return (
    <div className={styles.rail}>
      {previous.map((trip) => (
        <div key={trip.id} className={`${styles.slot} ${styles.dim}`}>
          <TripCard trip={trip} today={today} />
        </div>
      ))}
      {hero && (
        <div className={`${styles.slot} ${styles.heroSlot}`} data-testid="hero-slot">
          <TripCard trip={hero} today={today} size="hero" />
        </div>
      )}
      {future.map((trip) => (
        <div key={trip.id} className={styles.slot}>
          <TripCard trip={trip} today={today} />
        </div>
      ))}
    </div>
  )
}
