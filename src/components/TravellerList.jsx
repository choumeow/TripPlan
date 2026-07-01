import { initials } from '../lib/display'
import styles from './TravellerList.module.css'

export function TravellerList({ trip, canManage = false, onAdd, onRemove }) {
  const members = trip.trip_members ?? []
  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.h2}>
          {members.length} {members.length === 1 ? 'Traveller' : 'Travellers'}
        </h2>
        {canManage && onAdd && (
          <button type="button" className={styles.addBtn} onClick={onAdd}>+ Add traveller</button>
        )}
      </div>
      <ul className={styles.list}>
        {members.map((m) => {
          const name = m.profiles?.display_name ?? m.display_name ?? 'Guest'
          const pending = m.invite_status === 'pending'
          return (
            <li key={m.id} className={styles.row}>
              <span className={styles.av} style={{ background: trip.accent_color }}>{initials(name)}</span>
              <span className={styles.name}>{name}</span>
              {pending && <span className={styles.pending}>pending</span>}
              <span className={`${styles.tag} ${m.role === 'host' ? styles.host : ''}`}>{m.role}</span>
              {canManage && m.role !== 'host' && (
                <button type="button" className={styles.remove} aria-label={`Remove ${name}`}
                  onClick={() => onRemove(m)}>✕</button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
