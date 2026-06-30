import { useState } from 'react'
import { useTrips } from '../hooks/useTrips'
import { TripTimeline } from '../components/TripTimeline'
import { CreateTripModal } from '../components/CreateTripModal'
import { PlaneIcon } from '../components/PlaneIcon'
import styles from './Dashboard.module.css'

const today = () => new Date().toISOString().slice(0, 10)

export function Dashboard() {
  const { data: trips, isLoading, isError, refetch } = useTrips()
  const [creating, setCreating] = useState(false)

  return (
    <section>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Your trips</h1>
          <p className={styles.sub}>Plan journeys with your crew.</p>
        </div>
        <button type="button" className={styles.newTrip} onClick={() => setCreating(true)}>
          + New trip
        </button>
      </div>

      {isLoading && <p className={styles.muted}>Loading your trips…</p>}

      {isError && (
        <div role="alert" className={styles.error}>
          <p>We couldn&apos;t load your trips. Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()}>Try again</button>
        </div>
      )}

      {!isLoading && !isError && trips?.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyBadge}><PlaneIcon className={styles.emptyPlane} /></span>
          <h2 className={styles.emptyTitle}>No trips yet</h2>
          <p className={styles.emptyText}>
            Create your first trip and invite friends to start planning together.
          </p>
          <button type="button" className={styles.emptyCta} onClick={() => setCreating(true)}>
            Plan your first journey
          </button>
        </div>
      )}

      {!isLoading && !isError && trips?.length > 0 && (
        <TripTimeline trips={trips} today={today()} />
      )}

      <CreateTripModal isOpen={creating} onClose={() => setCreating(false)} />
    </section>
  )
}
