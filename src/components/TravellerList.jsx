import styles from './TravellerList.module.css'

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export function TravellerList({ trip }) {
  const members = trip.trip_members ?? []
  return (
    <section className={styles.wrap}>
      <h2 className={styles.h2}>
        {members.length} {members.length === 1 ? 'Traveller' : 'Travellers'}
      </h2>
      <ul className={styles.list}>
        {members.map((m) => {
          const name = m.profiles?.display_name ?? m.display_name ?? 'Guest'
          return (
            <li key={m.id} className={styles.row}>
              <span className={styles.av} style={{ background: trip.accent_color }}>{initials(name)}</span>
              <span className={styles.name}>{name}</span>
              <span className={`${styles.tag} ${m.role === 'host' ? styles.host : ''}`}>{m.role}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
