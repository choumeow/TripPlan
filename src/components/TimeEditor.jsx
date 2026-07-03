import styles from './TimeEditor.module.css'

// Start time + optional duration. Emits { startTime } / { durationMin } patches.
export function TimeEditor({ time, durationMin, durationDisabled, onChange }) {
  return (
    <div className={styles.editor}>
      <label className={styles.lbl}>Start
        <input type="time" defaultValue={time ? String(time).slice(0, 5) : ''}
          onChange={(e) => onChange({ startTime: e.target.value || null })} />
      </label>
      {!durationDisabled && (
        <label className={styles.lbl}>Mins
          <input type="number" min="0" defaultValue={durationMin ?? ''}
            onChange={(e) => onChange({ durationMin: e.target.value ? Number(e.target.value) : null })} />
        </label>
      )}
    </div>
  )
}
