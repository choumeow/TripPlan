import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { countdownLabel, nights, monthDay } from '../lib/tripDates'
import { useRemoveMember } from '../hooks/useRemoveMember'
import { TransportSection } from '../components/TransportSection'
import { TravellerList } from '../components/TravellerList'
import { EditTripModal } from '../components/EditTripModal'
import { AddTravellerModal } from '../components/AddTravellerModal'
import styles from './Overview.module.css'

const today = () => new Date().toISOString().slice(0, 10)

export function Overview() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const removeMember = useRemoveMember(trip.id)

  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)
  const canManage = me?.role === 'host'

  function handleRemove(member) {
    const name = member.profiles?.display_name ?? member.display_name ?? 'this traveller'
    if (window.confirm(`Remove ${name} from this trip?`)) removeMember.mutate(member.id)
  }

  return (
    <section>
      <div className={styles.hero}>
        <span className={styles.accent} style={{ background: trip.accent_color }} />
        <div className={styles.pad}>
          <div className={styles.ey}>
            <span>BOARDING PASS</span>
            <span className={styles.code}>{trip.code}</span>
          </div>
          {canEdit && (
            <button type="button" className={styles.edit} onClick={() => setEditing(true)}>✎ Edit</button>
          )}
          <h1 className={styles.dest}>{trip.name}</h1>
          <p className={styles.place}><span className={styles.dot} /> {trip.place}</p>
          <p className={styles.dates}>
            {monthDay(trip.start_date)} — {monthDay(trip.end_date)} · {nights(trip)} nights
          </p>
          <span className={styles.badge}>{countdownLabel(trip, today())}</span>
        </div>
      </div>

      <TransportSection trip={trip} canEdit={canEdit} memberId={me?.id ?? null} />
      <TravellerList trip={trip} canManage={canManage} onAdd={() => setAdding(true)} onRemove={handleRemove} />

      {editing && <EditTripModal trip={trip} onClose={() => setEditing(false)} />}
      {adding && <AddTravellerModal tripId={trip.id} onClose={() => setAdding(false)} />}
    </section>
  )
}
