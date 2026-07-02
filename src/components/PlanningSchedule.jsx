import { useState } from 'react'
import { tripDays, monthDay } from '../lib/tripDates'
import { partitionSchedule } from '../lib/schedule'
import { categoryMeta } from '../lib/placeCategories'
import { ViewToggle } from './ViewToggle'
import { DayColumn } from './DayColumn'
import styles from './PlanningSchedule.module.css'

const STAY = { label: 'Stay', color: '#22C55E' }
const TRANSPORT_COLOR = '#14B8A6'

// A scheduled wrapped item → the compact card view-model DayColumn/ScheduledCard render.
function toCard(item) {
  const r = item.raw
  if (item.source === 'transport') {
    return { dndId: item.dndId, title: `${r.from_text} → ${r.to_text}`, color: TRANSPORT_COLOR, time: item.time, durationMin: null }
  }
  const meta = r.kind === 'place' ? categoryMeta(r.category) : STAY
  return { dndId: item.dndId, title: r.title, color: meta.color, time: item.time, durationMin: r.duration_min ?? null }
}

export function PlanningSchedule({ trip, canEdit, onSetTime, onRemove }) {
  const [view, setView] = useState('board')
  const { byDay } = partitionSchedule(trip)

  return (
    <section className={styles.wrap} aria-label="Planning schedule">
      <div className={styles.head}>
        <ViewToggle view={view} onChange={setView} />
      </div>
      {view === 'board' ? (
        <div className={styles.days}>
          {tripDays(trip).map((d) => (
            <DayColumn key={d.date} date={d.date} label={`Day ${d.index} · ${monthDay(d.date)}`}
              cards={(byDay[d.date] ?? []).map(toCard)} canEdit={canEdit}
              onSetTime={(card, patch) => onSetTime(card, patch)} onRemove={(card) => onRemove(card)} />
          ))}
        </div>
      ) : (
        <div className={styles.soon}>The {view} view is coming soon.</div>
      )}
    </section>
  )
}
