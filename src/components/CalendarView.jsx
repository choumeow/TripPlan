import { useDroppable } from '@dnd-kit/core'
import { tripDays, monthDay } from '../lib/tripDates'
import { partitionSchedule } from '../lib/schedule'
import { categoryMeta } from '../lib/placeCategories'
import { DAY_START, DAY_END, SLOT, SLOT_PX, timeToMin, minToTime, slotId, calendarLayout } from '../lib/calendar'
import { CalendarBlock } from './CalendarBlock'
import styles from './CalendarView.module.css'

const STAY = { label: 'Stay', color: '#22C55E' }
const TRANSPORT_COLOR = '#14B8A6'
const TRANSPORT_DUR = 30 // visual height for a transport block (no duration column)

function itemView(item) {
  const r = item.raw
  if (item.source === 'transport') {
    return { dndId: item.dndId, title: `${r.from_text} → ${r.to_text}`, color: TRANSPORT_COLOR, time: item.time, durationMin: null, source: 'transport' }
  }
  const meta = r.kind === 'place' ? categoryMeta(r.category) : STAY
  return { dndId: item.dndId, title: r.title, color: meta.color, time: item.time, durationMin: r.duration_min ?? null, source: 'plan' }
}

function Slot({ date, min }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId(date, min) })
  const style = { position: 'absolute', left: 0, right: 0, top: ((min - DAY_START) / SLOT) * SLOT_PX, height: SLOT_PX }
  return <div ref={setNodeRef} style={style} className={`${styles.slot} ${min % 60 === 0 ? styles.hour : ''} ${isOver ? styles.over : ''}`} />
}

function Parked({ date, items, canEdit, onSetTime, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cal:${date}:untimed` })
  return (
    <div ref={setNodeRef} className={`${styles.parked} ${isOver ? styles.over : ''}`}>
      {items.map((it) => (
        <CalendarBlock key={it.dndId} card={it} style={{ position: 'relative', marginBottom: 4 }}
          canEdit={canEdit} onSetTime={(patch) => onSetTime(it, patch)} onRemove={() => onRemove(it)} />
      ))}
    </div>
  )
}

function DayCol({ date, timed, canEdit, onSetTime, onRemove }) {
  const slots = []
  for (let m = DAY_START; m <= DAY_END; m += SLOT) slots.push(m)
  const laid = calendarLayout(timed.map((t) => ({ id: t.dndId, startMin: timeToMin(t.time), durMin: t.durationMin || TRANSPORT_DUR })))
  const byId = Object.fromEntries(laid.map((l) => [l.id, l]))
  return (
    <div className={styles.daycol} style={{ height: (slots.length) * SLOT_PX }}>
      {slots.map((m) => <Slot key={m} date={date} min={m} />)}
      {timed.map((t) => {
        const L = byId[t.dndId]
        const style = {
          top: ((L.startMin - DAY_START) / SLOT) * SLOT_PX,
          height: Math.max(SLOT_PX - 3, (L.durMin / SLOT) * SLOT_PX - 3),
          left: `calc(${(L.col / L.colCount) * 100}% + 2px)`,
          width: `calc(${(1 / L.colCount) * 100}% - 4px)`,
        }
        return <CalendarBlock key={t.dndId} card={t} style={style} canEdit={canEdit}
          onSetTime={(patch) => onSetTime(t, patch)} onRemove={() => onRemove(t)} />
      })}
    </div>
  )
}

export function CalendarView({ trip, canEdit, onSetTime, onRemove }) {
  const { byDay } = partitionSchedule(trip)
  const days = tripDays(trip)
  const times = []
  for (let m = DAY_START; m <= DAY_END; m += SLOT) times.push(m)
  const cols = `56px repeat(${days.length}, minmax(150px, 1fr))`
  const timedFor = (date) => (byDay[date] ?? []).filter((i) => i.time).map(itemView)
  const untimedFor = (date) => (byDay[date] ?? []).filter((i) => !i.time).map(itemView)

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow} style={{ gridTemplateColumns: cols }}>
        <div className={styles.corner} />
        {days.map((d) => <div key={d.date} className={styles.dh}>Day {d.index} · {monthDay(d.date)}</div>)}
        <div className={styles.untlbl}>Untimed</div>
        {days.map((d) => (
          <Parked key={d.date} date={d.date} items={untimedFor(d.date)} canEdit={canEdit} onSetTime={onSetTime} onRemove={onRemove} />
        ))}
      </div>
      <div className={styles.bodyScroll}>
        <div className={styles.body} style={{ gridTemplateColumns: cols }}>
          <div className={styles.gutter}>
            {times.map((m) => <div key={m} className={styles.tlabel} style={{ height: SLOT_PX }}>{minToTime(m)}</div>)}
          </div>
          {days.map((d) => (
            <DayCol key={d.date} date={d.date} timed={timedFor(d.date)} canEdit={canEdit} onSetTime={onSetTime} onRemove={onRemove} />
          ))}
        </div>
      </div>
    </div>
  )
}
