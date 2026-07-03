import { groupByCategory, progress } from '../lib/packing'
import { packingCategoryMeta } from '../lib/packingCategories'
import { memberName } from '../lib/display'
import { PackingItemRow } from './PackingItemRow'
import styles from './PackingList.module.css'

export function PackingList({ title, glyph, scope, items, members, canAdd, canManage, hint, onAdd, onToggle, onEdit, onRemove }) {
  const p = progress(items)
  const groups = groupByCategory(items)
  const byId = new Map((members ?? []).map((m) => [m.id, m]))
  const showAssignee = scope === 'shared'

  return (
    <section className={styles.pane}>
      <div className={styles.head}>
        <h2 className={styles.title}><span aria-hidden="true">{glyph}</span> {title}</h2>
        <span className={styles.prog}>{p.packed} / {p.total} packed</span>
        {canAdd && (
          <button type="button" className={styles.add} onClick={onAdd}>+ Add item</button>
        )}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}

      {groups.length === 0 ? (
        <p className={styles.empty}>Nothing packed yet.</p>
      ) : (
        <div className={styles.cols}>
          {groups.map((g) => {
            const meta = packingCategoryMeta(g.key)
            return (
              <div key={g.key} className={styles.cat}>
                <div className={styles.catHead}>
                  <span aria-hidden="true">{meta.glyph}</span> {meta.label}
                  <span className={styles.catN}>{progress(g.items).packed}/{g.items.length}</span>
                </div>
                {g.items.map((it) => (
                  <PackingItemRow
                    key={it.id}
                    item={it}
                    showAssignee={showAssignee}
                    assigneeName={it.assignee_member_id ? memberName(byId.get(it.assignee_member_id)) : null}
                    canManage={canManage}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
