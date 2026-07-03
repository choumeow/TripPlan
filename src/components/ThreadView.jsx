import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { tripDays, monthDay } from '../lib/tripDates'
import { partitionSchedule } from '../lib/schedule'
import { categoryMeta } from '../lib/placeCategories'
import { SortableItem } from './SortableItem'
import { ScheduledCard } from './ScheduledCard'
import styles from './ThreadView.module.css'

const STAY = { label: 'Stay', color: '#22C55E' }
const TRANSPORT_COLOR = '#14B8A6'

// A wrapped scheduled item -> the compact card view-model ScheduledCard renders.
function toCard(item) {
  const r = item.raw
  if (item.source === 'transport') {
    return { dndId: item.dndId, title: `${r.from_text} → ${r.to_text}`, color: TRANSPORT_COLOR, time: item.time, durationMin: null, source: 'transport' }
  }
  const meta = r.kind === 'place' ? categoryMeta(r.category) : STAY
  return { dndId: item.dndId, title: r.title, color: meta.color, time: item.time, durationMin: r.duration_min ?? null, source: 'plan' }
}

function DaySection({ date, label, cards, canEdit, onSetTime, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` })
  return (
    <div className={styles.day}>
      <div className={styles.divider}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.dlabel}>{label}</span>
        <span className={styles.count}>· {cards.length}</span>
      </div>
      <SortableContext items={cards.map((c) => c.dndId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`${styles.list} ${isOver ? styles.over : ''}`}>
          {cards.length === 0 ? (
            <div className={styles.empty}>nothing planned — drop here</div>
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

export function ThreadView({ trip, canEdit, onSetTime, onRemove }) {
  const { byDay } = partitionSchedule(trip)
  return (
    <div className={styles.rail}>
      {tripDays(trip).map((d) => (
        <DaySection key={d.date} date={d.date} label={`Day ${d.index} · ${monthDay(d.date)}`}
          cards={(byDay[d.date] ?? []).map(toCard)} canEdit={canEdit} onSetTime={onSetTime} onRemove={onRemove} />
      ))}
    </div>
  )
}
