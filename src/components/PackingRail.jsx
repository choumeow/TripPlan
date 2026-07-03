import styles from './PackingRail.module.css'

function pct({ packed, total }) {
  return total ? Math.round((packed / total) * 100) : 0
}

function ListButton({ entry, selected, onSelect }) {
  return (
    <button type="button"
      className={`${styles.litem} ${selected === entry.id ? styles.on : ''}`}
      aria-current={selected === entry.id}
      onClick={() => onSelect(entry.id)}>
      <span className={styles.ic} aria-hidden="true">{entry.glyph}</span>
      <span className={styles.body}>
        <span className={styles.nm}>{entry.label}</span>
        <span className={styles.mini}><span style={{ width: `${pct(entry)}%` }} /></span>
      </span>
      {entry.tag
        ? <span className={`${styles.tag} ${entry.ghost ? styles.ghostTag : styles.privTag}`}>{entry.tag}</span>
        : <span className={styles.mt}>{entry.packed}/{entry.total}</span>}
    </button>
  )
}

export function PackingRail({ overall, entries, selected, onSelect }) {
  const main = entries.filter((e) => !e.ghost)
  const ghosts = entries.filter((e) => e.ghost)
  return (
    <aside className={styles.rail}>
      <div className={styles.overall}>
        <div className={styles.accent} />
        <div className={styles.pad}>
          <p className={styles.ey}>Packed so far</p>
          <p className={styles.big}>{overall.packed} / {overall.total} <small>items</small></p>
          <div className={styles.meter}><span style={{ width: `${pct(overall)}%` }} /></div>
        </div>
      </div>
      <nav className={styles.lists}>
        <p className={styles.lbl}>Lists</p>
        {main.map((e) => <ListButton key={e.id} entry={e} selected={selected} onSelect={onSelect} />)}
        {ghosts.length > 0 && (
          <>
            <p className={styles.lbl}>Ghost travellers</p>
            {ghosts.map((e) => <ListButton key={e.id} entry={e} selected={selected} onSelect={onSelect} />)}
          </>
        )}
      </nav>
    </aside>
  )
}
