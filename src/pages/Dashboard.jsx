import { PlaneIcon } from '../components/PlaneIcon'
import styles from './Dashboard.module.css'

export function Dashboard() {
  return (
    <section>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Your trips</h1>
          <p className={styles.sub}>Plan journeys with your crew.</p>
        </div>
        <button type="button" className={styles.newTrip}>
          + New trip
        </button>
      </div>

      <div className={styles.empty}>
        <span className={styles.emptyBadge}>
          <PlaneIcon className={styles.emptyPlane} />
        </span>
        <h2 className={styles.emptyTitle}>No trips yet</h2>
        <p className={styles.emptyText}>
          Create your first trip and invite friends to start planning together.
        </p>
        <button type="button" className={styles.emptyCta}>
          Plan your first journey
        </button>
      </div>
    </section>
  )
}
