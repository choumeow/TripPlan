import { useState } from 'react'
import { TimeEditor } from './TimeEditor'
import styles from './ScheduledCard.module.css'

export function ScheduledCard({ card, canEdit, onSetTime, onRemove }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className={styles.card}>
      <span className={styles.dot} style={{ background: card.color }} />
      {card.time && <span className={styles.time}>{card.time.slice(0, 5)}</span>}
      <span className={styles.nm}>{card.title}</span>
      {canEdit && (
        <span className={styles.acts}>
          <button type="button" className={styles.ibtn} aria-label={`Set time for ${card.title}`}
            onClick={() => setEditing((e) => !e)}>⏰</button>
          <button type="button" className={styles.ibtn} aria-label={`Remove ${card.title} from day`}
            onClick={onRemove}>✕</button>
        </span>
      )}
      {editing && canEdit && (
        <TimeEditor time={card.time} durationMin={card.durationMin} onChange={onSetTime} />
      )}
    </div>
  )
}
