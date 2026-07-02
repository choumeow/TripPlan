import styles from './ViewToggle.module.css'

const VIEWS = [
  { key: 'board', label: 'Board' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'thread', label: 'Thread' },
]

export function ViewToggle({ view, onChange }) {
  return (
    <div className={styles.toggle} role="group" aria-label="View">
      {VIEWS.map((v) => (
        <button key={v.key} type="button"
          className={`${styles.btn} ${view === v.key ? styles.on : ''}`}
          aria-pressed={view === v.key} onClick={() => onChange(v.key)}>
          {v.label}
        </button>
      ))}
    </div>
  )
}
