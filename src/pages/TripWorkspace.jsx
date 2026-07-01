import { Outlet, useParams, Link } from 'react-router-dom'
import { useTrip } from '../hooks/useTrip'
import { TripSubHeader } from '../components/TripSubHeader'
import { TripTabs } from '../components/TripTabs'
import styles from './TripWorkspace.module.css'

export function TripWorkspace() {
  const { tripId } = useParams()
  const { data: trip, isLoading, isError, refetch } = useTrip(tripId)

  if (isLoading) return <p className={styles.muted}>Loading trip…</p>

  if (isError) {
    return (
      <div role="alert" className={styles.error}>
        <p>We couldn&apos;t load this trip. Check your connection and try again.</p>
        <button type="button" onClick={() => refetch()}>Try again</button>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className={styles.notfound}>
        <h1 className={styles.nfTitle}>Trip not found</h1>
        <p className={styles.nfText}>This trip doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link to="/" className={styles.back}>← Back to trips</Link>
      </div>
    )
  }

  return (
    <div className={styles.workspace}>
      <TripSubHeader trip={trip} />
      <TripTabs />
      <div className={styles.body}>
        <Outlet context={{ trip }} />
      </div>
    </div>
  )
}
