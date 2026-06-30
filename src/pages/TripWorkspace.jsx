import { Link, useParams } from 'react-router-dom'
import styles from './TripWorkspace.module.css'

// Placeholder. The full workspace (Overview / Planning / Packing / Finance /
// Discussion) is built in subsystem #2; this just gives the trip card a real
// destination to open.
export function TripWorkspace() {
  const { tripId } = useParams()
  return (
    <section className={styles.wrap}>
      <Link to="/" className={styles.back}>
        ← Back to trips
      </Link>
      <h1 className={styles.title}>Trip workspace</h1>
      <p className={styles.note}>
        Overview, Planning, Packing, Finance, and Discussion land in the next
        subsystem.
      </p>
      <p className={styles.muted}>
        Trip <code className={styles.code}>{tripId}</code>
      </p>
    </section>
  )
}
