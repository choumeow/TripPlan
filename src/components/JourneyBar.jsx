import { PlaneIcon } from './PlaneIcon'
import styles from './JourneyBar.module.css'

export function JourneyBar({ progress, label }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)))
  return (
    <div className={styles.bar}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
        aria-label="Time until departure"
      >
        <span className={styles.fill} style={{ width: `${pct}%` }} />
        <span className={styles.plane} style={{ left: `${pct}%` }}>
          <PlaneIcon className={styles.planeIcon} />
        </span>
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  )
}
