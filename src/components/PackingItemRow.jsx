import { packingCategoryMeta } from '../lib/packingCategories'
import styles from './PackingItemRow.module.css'

export function PackingItemRow({ item, showAssignee, assigneeName, canManage, onToggle, onEdit, onRemove }) {
  const meta = packingCategoryMeta(item.category)
  return (
    <div className={`${styles.row} ${item.packed ? styles.done : ''}`}>
      <button
        type="button"
        className={`${styles.check} ${item.packed ? styles.on : ''}`}
        aria-pressed={item.packed}
        aria-label={`${item.packed ? 'Unmark' : 'Mark'} ${item.title} packed`}
        onClick={() => onToggle(item)}
      >
        {item.packed ? '✓' : ''}
      </button>
      <span className={styles.glyph} aria-hidden="true">{meta.glyph}</span>
      <span className={styles.title}>{item.title}</span>
      <span className={styles.spacer} />
      {showAssignee && (
        assigneeName
          ? <span className={styles.chip}>{assigneeName}</span>
          : <span className={`${styles.chip} ${styles.unassigned}`}>Unassigned</span>
      )}
      {canManage && (
        <span className={styles.act}>
          <button type="button" aria-label={`Edit ${item.title}`}
            onClick={(e) => { e.stopPropagation(); onEdit(item) }}>✎</button>
          <button type="button" aria-label={`Remove ${item.title}`}
            onClick={(e) => { e.stopPropagation(); onRemove(item) }}>✕</button>
        </span>
      )}
    </div>
  )
}
