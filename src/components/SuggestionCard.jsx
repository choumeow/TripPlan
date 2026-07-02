import { useState } from 'react'
import { initials } from '../lib/display'
import styles from './SuggestionCard.module.css'

export function SuggestionCard({ card, canEdit, onEdit, onRemove }) {
  const [flipped, setFlipped] = useState(false)
  const [pressing, setPressing] = useState(false)

  const cls = [styles.flip, card.matches ? '' : styles.dim, flipped ? styles.flipped : '', pressing ? styles.pressing : '']
    .filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      onClick={() => setFlipped((f) => !f)}
      onPointerDown={() => setPressing(true)}
      onPointerUp={() => setPressing(false)}
      onPointerCancel={() => setPressing(false)}
      onPointerLeave={() => setPressing(false)}
    >
      <div className={styles.inner}>
        <div className={`${styles.face} ${styles.front}`}>
          <span className={styles.stripe} style={{ background: card.color }} />
          <div className={styles.fbody}>
            <p className={styles.nm}>{card.title}</p>
            <span className={styles.pill} style={{ background: card.color }}>{card.pillLabel}</span>
            {card.showAvail && card.availLabel && <span className={styles.avail}>🕒 {card.availLabel}</span>}
            <span className={styles.who}>
              <span className={styles.av} style={{ background: card.color }}>{initials(card.createdByName)}</span>
              {card.createdByName}
            </span>
          </div>
        </div>
        <div className={`${styles.face} ${styles.back}`}>
          <span className={styles.btop} style={{ background: card.color }} />
          <div className={styles.bbody}>
            {card.availLabel && (
              <div className={styles.row}><span className={styles.k}>Available</span><span>🕒 {card.availLabel}</span></div>
            )}
            {card.rows.map((r) => (
              <div key={r.k} className={styles.row}><span className={styles.k}>{r.k}</span><span>{r.v}</span></div>
            ))}
          </div>
          {canEdit && (
            <div className={styles.acts}>
              <button type="button" className={styles.ibtn}
                onClick={(e) => { e.stopPropagation(); onEdit() }}>✎ Edit</button>
              <button type="button" className={styles.ibtn}
                onClick={(e) => { e.stopPropagation(); onRemove() }}>✕ Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
