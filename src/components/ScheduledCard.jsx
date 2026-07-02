import { useState } from 'react'
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
        <div className={styles.editor}>
          <label className={styles.lbl}>Start
            <input type="time" defaultValue={card.time ? card.time.slice(0, 5) : ''}
              onChange={(e) => onSetTime({ startTime: e.target.value || null })} />
          </label>
          <label className={styles.lbl}>Mins
            <input type="number" min="0" defaultValue={card.durationMin ?? ''}
              onChange={(e) => onSetTime({ durationMin: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>
      )}
    </div>
  )
}
