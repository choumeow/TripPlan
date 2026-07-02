import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SortableItem } from './SortableItem'
import { ScheduledCard } from './ScheduledCard'
import styles from './DayColumn.module.css'

export function DayColumn({ date, label, cards, canEdit, onSetTime, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` })
  return (
    <div className={styles.day}>
      <div className={styles.head}>{label}</div>
      <SortableContext items={cards.map((c) => c.dndId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`${styles.body} ${isOver ? styles.over : ''}`}>
          {cards.length === 0 ? (
            <div className={styles.drop}>drop a suggestion here</div>
          ) : (
            cards.map((c) => (
              <SortableItem key={c.dndId} id={c.dndId} disabled={!canEdit}>
                <ScheduledCard card={c} canEdit={canEdit}
                  onSetTime={(patch) => onSetTime(c, patch)} onRemove={() => onRemove(c)} />
              </SortableItem>
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
