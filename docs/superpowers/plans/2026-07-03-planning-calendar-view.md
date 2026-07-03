# Planning — Calendar View (#3b‑2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Planning **Calendar** view real — a multi‑day time grid (days × hours, 00:00–23:30 in 30‑min slots) rendering the same scheduled data, where you drag suggestions onto a (day, time) slot, drag blocks to reschedule, and adjust time by drag‑snap or an exact editor.

**Architecture:** No schema change — reuses `scheduled_date`/`start_time`/`duration_min` + the `useScheduleItem` write. Calendar **slots are the droppables** (`cal:YYYY-MM-DD:HHMM` + `cal:…:untimed`); `computeDrop` gains a `cal:` branch so the one `Planning` `onDragEnd` serves both views. Pure `lib/calendar` holds overlap‑column layout + time helpers. A shared `TimeEditor` is extracted and used by both the Board's `ScheduledCard` and the new `CalendarBlock`.

**Tech Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, `@dnd-kit/core`, CSS Modules, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-03-planning-calendar-view-design.md`

**Branch:** `feat/planning-calendar` (create at execution start; repo currently on `main`)

**Test commands:** `npx vitest run <path>` (one) · `npm run test:run` (all). A run sometimes prints "Test Files N failed / no tests" on the FIRST invocation — a known cold‑start flake on this repo; RE‑RUN once and it passes. Do NOT reinstall packages or use `--pool=vmThreads`.

**DnD testing note:** `@dnd-kit` pointer drag needs layout measurements jsdom lacks, so drop behavior is unit‑tested through `lib/schedule`/`lib/calendar` (pure); the drag UI is verified in the Task 7 manual smoke test.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/calendar.js` + test | constants, `timeToMin`/`minToTime`/`slotId`/`parseSlotId`, `calendarLayout` (overlap columns) |
| `src/lib/schedule.js` (modify) + test | `computeDrop` handles `cal:` slot / `cal:…:untimed` ids |
| `src/components/TimeEditor.jsx` + css + test | shared start‑time + duration inputs → `onChange(patch)` |
| `src/components/ScheduledCard.jsx` (refactor) | use `TimeEditor` instead of its inline editor |
| `src/components/CalendarBlock.jsx` + css + test | draggable timed block; height=duration; click→`TimeEditor`; ✕ unschedule |
| `src/components/CalendarView.jsx` + css + test | day columns × 30‑min slot droppables + parked strip; positions blocks |
| `src/components/PlanningSchedule.jsx` (modify) + test | render `<CalendarView>` when `view==='calendar'` |

No change to `Planning.jsx` (its `computeDrop` now routes `cal:`), `useScheduleItem`, or the DB.

---

## Task 1: Pure calendar helpers — `lib/calendar.js`

**Files:** Create `src/lib/calendar.js`, `src/lib/calendar.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/calendar.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { DAY_START, DAY_END, SLOT, timeToMin, minToTime, slotId, parseSlotId, calendarLayout } from './calendar'

describe('time helpers', () => {
  it('has a full-day 30-min grid', () => {
    expect(DAY_START).toBe(0)
    expect(DAY_END).toBe(23 * 60 + 30)
    expect(SLOT).toBe(30)
  })
  it('converts time <-> minutes (tolerating HH:MM:SS)', () => {
    expect(timeToMin('09:30')).toBe(570)
    expect(timeToMin('09:30:00')).toBe(570)
    expect(timeToMin(null)).toBeNull()
    expect(minToTime(570)).toBe('09:30')
    expect(minToTime(0)).toBe('00:00')
  })
  it('builds and parses slot ids', () => {
    expect(slotId('2026-07-04', 570)).toBe('cal:2026-07-04:0930')
    expect(parseSlotId('cal:2026-07-04:0930')).toEqual({ date: '2026-07-04', min: 570 })
    expect(parseSlotId('cal:2026-07-04:untimed')).toEqual({ date: '2026-07-04', min: null })
  })
})

describe('calendarLayout (overlap columns)', () => {
  it('gives non-overlapping items a single column', () => {
    const laid = calendarLayout([
      { id: 'a', startMin: 540, durMin: 60 }, // 09:00–10:00
      { id: 'b', startMin: 660, durMin: 60 }, // 11:00–12:00
    ])
    expect(laid.every((x) => x.colCount === 1 && x.col === 0)).toBe(true)
  })
  it('puts overlapping items in side-by-side columns', () => {
    const laid = calendarLayout([
      { id: 'a', startMin: 540, durMin: 60 }, // 09:00–10:00
      { id: 'b', startMin: 570, durMin: 60 }, // 09:30–10:30 (overlaps a)
    ])
    const a = laid.find((x) => x.id === 'a'); const b = laid.find((x) => x.id === 'b')
    expect(a.colCount).toBe(2); expect(b.colCount).toBe(2)
    expect(new Set([a.col, b.col])).toEqual(new Set([0, 1]))
  })
  it('treats touching-but-not-overlapping as one column', () => {
    const laid = calendarLayout([
      { id: 'a', startMin: 540, durMin: 60 }, // 09:00–10:00
      { id: 'b', startMin: 600, durMin: 60 }, // 10:00–11:00 (touches, no overlap)
    ])
    expect(laid.every((x) => x.colCount === 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/calendar.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/calendar.js`:

```js
// Pure calendar-grid math. No @dnd-kit, no React.
export const DAY_START = 0            // minutes from midnight
export const DAY_END = 23 * 60 + 30   // 23:30
export const SLOT = 30                // minutes per slot
export const SLOT_PX = 30             // px per slot (used by the components)

export function timeToMin(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}
export function minToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function slotId(date, min) {
  return `cal:${date}:${minToTime(min).replace(':', '')}`
}
export function parseSlotId(id) {
  const rest = id.slice(4)                 // strip 'cal:'
  const i = rest.lastIndexOf(':')          // date has no other ':'
  const date = rest.slice(0, i)
  const tail = rest.slice(i + 1)
  if (tail === 'untimed') return { date, min: null }
  return { date, min: Number(tail.slice(0, 2)) * 60 + Number(tail.slice(2)) }
}

// [{ id, startMin, durMin }] -> same + { col, colCount }, packing overlaps side by side.
export function calendarLayout(items) {
  const sorted = items.slice().sort((a, b) => a.startMin - b.startMin || a.durMin - b.durMin)
  const colEnds = []                       // running end-min per column
  const placed = sorted.map((it) => {
    const end = it.startMin + it.durMin
    let col = colEnds.findIndex((e) => e <= it.startMin)
    if (col === -1) { col = colEnds.length; colEnds.push(end) } else { colEnds[col] = end }
    return { ...it, col }
  })
  // Group chain-overlapping items into clusters; colCount = columns used in the cluster.
  const out = []
  let cluster = []
  let clusterEnd = -Infinity
  const flush = () => {
    if (!cluster.length) return
    const colCount = Math.max(...cluster.map((c) => c.col)) + 1
    for (const c of cluster) out.push({ ...c, colCount })
    cluster = []
  }
  for (const it of placed) {
    if (it.startMin >= clusterEnd) { flush(); clusterEnd = -Infinity }
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.startMin + it.durMin)
  }
  flush()
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/calendar.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar.js src/lib/calendar.test.js
git commit -m "feat: add pure calendar helpers (time/slot + overlap layout)"
```

---

## Task 2: `computeDrop` — calendar‑slot branch

**Files:** Modify `src/lib/schedule.js`; append to `src/lib/schedule.test.js`

- [ ] **Step 1: Append the failing test**

Append inside the `describe('computeDrop', …)` block in `src/lib/schedule.test.js`:

```js
  it('schedules onto a calendar slot with a start time', () => {
    const drop = computeDrop('plan:a', 'cal:2026-07-04:0930', trip)
    expect(drop.updates).toEqual([{ source: 'plan', id: 'a', patch: { scheduledDate: '2026-07-04', startTime: '09:30' } }])
  })
  it('parks on a calendar day with no time (untimed target)', () => {
    const drop = computeDrop('tr:t', 'cal:2026-07-04:untimed', trip)
    expect(drop.updates).toEqual([{ source: 'transport', id: 't', patch: { scheduledDate: '2026-07-04', startTime: null } }])
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/schedule.test.js`
Expected: FAIL — `cal:` ids fall through to the board logic and don't return this shape.

- [ ] **Step 3: Update the implementation**

In `src/lib/schedule.js`, add the import at the top (after the existing lines, before `dndId`):

```js
import { parseSlotId, minToTime } from './calendar'
```

Then, inside `computeDrop`, immediately after the first guard line
`if (!overId || activeId === overId) return null`, insert:

```js
  if (overId.startsWith('cal:')) {
    const { source, id } = parseDndId(activeId)
    const { date, min } = parseSlotId(overId)
    return { updates: [{ source, id, patch: { scheduledDate: date, startTime: min === null ? null : minToTime(min) } }] }
  }
```

(The rest of `computeDrop` — the board `pending`/`day:`/item‑id logic — is unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/schedule.test.js`
Expected: PASS (the existing board cases + the two new calendar cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule.js src/lib/schedule.test.js
git commit -m "feat: computeDrop handles calendar slot drops"
```

---

## Task 3: Extract `TimeEditor` + refactor `ScheduledCard`

**Files:** Create `src/components/TimeEditor.jsx`, `.module.css`, `TimeEditor.test.jsx`; modify `src/components/ScheduledCard.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/TimeEditor.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeEditor } from './TimeEditor'

describe('TimeEditor', () => {
  it('emits a startTime patch on change', () => {
    const onChange = vi.fn()
    render(<TimeEditor time="09:00:00" durationMin={60} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: '10:30' } })
    expect(onChange).toHaveBeenCalledWith({ startTime: '10:30' })
  })
  it('emits a durationMin patch on change', () => {
    const onChange = vi.fn()
    render(<TimeEditor time="09:00:00" durationMin={60} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/min/i), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith({ durationMin: 90 })
  })
  it('hides duration when durationDisabled', () => {
    render(<TimeEditor time="09:00:00" durationMin={null} durationDisabled onChange={vi.fn()} />)
    expect(screen.queryByLabelText(/min/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/start/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/TimeEditor.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TimeEditor`**

Create `src/components/TimeEditor.jsx`:

```jsx
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
```

Create `src/components/TimeEditor.module.css`:

```css
.editor { display: flex; gap: 10px; margin-top: 6px; }
.lbl { display: flex; flex-direction: column; font-size: 10px; color: var(--ink-muted); gap: 2px; }
.editor input { font-size: 12px; padding: 3px 5px; border: 1.5px solid var(--border); border-radius: 6px; }
```

- [ ] **Step 4: Refactor `ScheduledCard` to use it**

In `src/components/ScheduledCard.jsx`, add the import:

```jsx
import { TimeEditor } from './TimeEditor'
```

Then replace the inline editor block:

```jsx
      {editing && canEdit && (
        <div className={styles.editor}>
          <label className={styles.lbl}>Start
            <input type="time" defaultValue={card.time ? card.time.slice(0, 5) : ''}
              onChange={(e) => onSetTime({ startTime: e.target.value || null })} />
          </label>
          <label className={styles.lbl}>Mins
            <input type="number" min="0" defaultValue={card.durationMin ?? ''}
              onChange={(e) => onSetTime({ durationMin: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>
      )}
```

with:

```jsx
      {editing && canEdit && (
        <TimeEditor time={card.time} durationMin={card.durationMin} onChange={onSetTime} />
      )}
```

(The `.editor`/`.lbl` rules can stay in `ScheduledCard.module.css` unused, or be removed — leaving them is harmless.)

- [ ] **Step 5: Run to verify both pass**

Run: `npx vitest run src/components/TimeEditor.test.jsx src/components/ScheduledCard.test.jsx`
Expected: PASS — TimeEditor's 3 tests, and ScheduledCard's existing 4 tests still pass (the Start/Mins labels + behavior are preserved).

- [ ] **Step 6: Commit**

```bash
git add src/components/TimeEditor.jsx src/components/TimeEditor.module.css src/components/TimeEditor.test.jsx src/components/ScheduledCard.jsx
git commit -m "feat: extract shared TimeEditor; ScheduledCard reuses it"
```

---

## Task 4: `CalendarBlock`

**Files:** Create `src/components/CalendarBlock.jsx`, `.module.css`, `CalendarBlock.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/CalendarBlock.test.jsx` (wraps in a `<DndContext>` so `useDraggable` mounts):

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import { CalendarBlock } from './CalendarBlock'

const card = { dndId: 'plan:b', title: 'Ichiran', color: '#F59E0B', time: '09:00:00', durationMin: 60, source: 'plan' }

function renderBlock(props) {
  return render(
    <DndContext>
      <CalendarBlock card={card} style={{}} canEdit onSetTime={vi.fn()} onRemove={vi.fn()} {...props} />
    </DndContext>,
  )
}

describe('CalendarBlock', () => {
  it('renders the time range and title', () => {
    renderBlock()
    expect(screen.getByText(/09:00.*10:00/)).toBeInTheDocument()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()
  })
  it('opens the time editor on click and forwards the patch', async () => {
    const onSetTime = vi.fn()
    renderBlock({ onSetTime })
    await userEvent.click(screen.getByText('Ichiran'))
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: '11:00' } })
    expect(onSetTime).toHaveBeenCalledWith({ startTime: '11:00' })
  })
  it('unschedules via the remove button', async () => {
    const onRemove = vi.fn()
    renderBlock({ onRemove })
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
  it('hides affordances for viewers', () => {
    renderBlock({ canEdit: false })
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/CalendarBlock.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/CalendarBlock.jsx`:

```jsx
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { timeToMin, minToTime } from '../lib/calendar'
import styles from './CalendarBlock.module.css'

export function CalendarBlock({ card, style, canEdit, onSetTime, onRemove }) {
  const [editing, setEditing] = useState(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.dndId, disabled: !canEdit })
  const startMin = timeToMin(card.time)
  const label = startMin != null
    ? `${minToTime(startMin)}${card.durationMin ? `–${minToTime(startMin + card.durationMin)}` : ''}`
    : ''
  const merged = {
    ...style,
    background: card.color,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <div ref={setNodeRef} className={styles.block} style={merged} {...attributes} {...listeners}
      onClick={(e) => { if (canEdit) { e.stopPropagation(); setEditing((v) => !v) } }}>
      {label && <span className={styles.time}>{label}</span>}
      <span className={styles.title}>{card.title}</span>
      {canEdit && (
        <button type="button" className={styles.x} aria-label={`Remove ${card.title} from day`}
          onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</button>
      )}
      {editing && canEdit && (
        <TimeEditor time={card.time} durationMin={card.durationMin}
          durationDisabled={card.source === 'transport'} onChange={onSetTime} />
      )}
    </div>
  )
}
```

Create `src/components/CalendarBlock.module.css`:

```css
.block { position: absolute; border-radius: 6px; padding: 3px 6px; color: #fff; font-size: 10px; font-weight: 600; overflow: hidden; box-shadow: 0 2px 6px rgba(15,23,42,0.2); cursor: grab; touch-action: none; }
.block:active { cursor: grabbing; }
.time { display: block; font-size: 9px; font-weight: 700; opacity: 0.9; }
.title { display: block; }
.x { position: absolute; top: 2px; right: 3px; font-size: 10px; color: #fff; background: none; border: none; opacity: 0.8; cursor: pointer; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/CalendarBlock.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarBlock.jsx src/components/CalendarBlock.module.css src/components/CalendarBlock.test.jsx
git commit -m "feat: add draggable CalendarBlock with inline time editor"
```

---

## Task 5: `CalendarView`

**Files:** Create `src/components/CalendarView.jsx`, `.module.css`, `CalendarView.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/CalendarView.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { CalendarView } from './CalendarView'

const trip = {
  start_date: '2026-07-03', end_date: '2026-07-04', trip_members: [],
  plan_items: [
    { id: 'timed', kind: 'place', category: 'meal', title: 'Ichiran', scheduled_date: '2026-07-03', start_time: '09:00:00', duration_min: 60, sort_order: 0 },
    { id: 'parked', kind: 'place', category: 'visit', title: 'Senso-ji', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
  ],
  transport: [],
}

function renderCal(canEdit = true) {
  return render(
    <DndContext>
      <CalendarView trip={trip} canEdit={canEdit} onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('CalendarView', () => {
  it('renders a column per trip day', () => {
    renderCal()
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 2 · JUL 04/)).toBeInTheDocument()
  })
  it('places a timed item as a block and parks a no-time item', () => {
    renderCal()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()   // timed block
    expect(screen.getByText('Senso-ji')).toBeInTheDocument()  // parked
    expect(screen.getByText('Untimed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/CalendarView.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/CalendarView.jsx`:

```jsx
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
```

Create `src/components/CalendarView.module.css`:

```css
.wrap { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.headRow { display: grid; border-bottom: 1px solid var(--border); }
.corner { background: #fbfdff; }
.dh { font-size: 12px; font-weight: 700; color: #334155; text-align: center; padding: 7px 0; background: #fbfdff; border-left: 1px solid var(--border); }
.untlbl { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-muted); text-align: right; padding: 5px 6px; background: #f8fafc; }
.parked { min-height: 34px; padding: 4px; background: #f8fafc; border-left: 1px solid var(--border); border-top: 1px solid var(--border); }
.bodyScroll { max-height: 520px; overflow: auto; }
.body { display: grid; }
.gutter { display: flex; flex-direction: column; }
.tlabel { font-size: 10px; color: var(--ink-muted); text-align: right; padding-right: 6px; border-top: 1px solid #f4f7fb; box-sizing: border-box; }
.daycol { position: relative; border-left: 1px solid var(--border); }
.slot { border-top: 1px solid #f4f7fb; box-sizing: border-box; }
.hour { border-top: 1px solid #e6ebf2; }
.over { background: var(--c-mist); }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/CalendarView.test.jsx`
Expected: PASS (2 tests). If the first run prints "no tests", re‑run once.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarView.jsx src/components/CalendarView.module.css src/components/CalendarView.test.jsx
git commit -m "feat: add multi-day CalendarView (time grid + parked strip)"
```

---

## Task 6: Render `CalendarView` from `PlanningSchedule`

**Files:** Modify `src/components/PlanningSchedule.jsx`; modify `src/components/PlanningSchedule.test.jsx`

- [ ] **Step 1: Update the test**

In `src/components/PlanningSchedule.test.jsx`, add a `CalendarView` mock after the existing imports/mocks section (near the top, before `import { PlanningSchedule }`):

```jsx
vi.mock('./CalendarView', () => ({ CalendarView: () => <div>CalendarView</div> }))
```

Then replace the existing second test (`'switches to Calendar/Thread placeholders via the toggle'`) with these two:

```jsx
  it('switches to the Calendar view', async () => {
    renderSched()
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(screen.getByText('CalendarView')).toBeInTheDocument()
    expect(screen.queryByText(/Day 1 · JUL 03/)).not.toBeInTheDocument()
  })
  it('shows a coming-soon placeholder for Thread', async () => {
    renderSched()
    await userEvent.click(screen.getByRole('button', { name: 'Thread' }))
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/PlanningSchedule.test.jsx`
Expected: FAIL — clicking Calendar still shows the "coming soon" text, not `CalendarView`.

- [ ] **Step 3: Update the component**

In `src/components/PlanningSchedule.jsx`, add the import:

```jsx
import { CalendarView } from './CalendarView'
```

Then replace the view‑branch block:

```jsx
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
```

with:

```jsx
      {view === 'board' && (
        <div className={styles.days}>
          {tripDays(trip).map((d) => (
            <DayColumn key={d.date} date={d.date} label={`Day ${d.index} · ${monthDay(d.date)}`}
              cards={(byDay[d.date] ?? []).map(toCard)} canEdit={canEdit}
              onSetTime={(card, patch) => onSetTime(card, patch)} onRemove={(card) => onRemove(card)} />
          ))}
        </div>
      )}
      {view === 'calendar' && (
        <CalendarView trip={trip} canEdit={canEdit} onSetTime={onSetTime} onRemove={onRemove} />
      )}
      {view === 'thread' && (
        <div className={styles.soon}>The thread view is coming soon.</div>
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/PlanningSchedule.test.jsx`
Expected: PASS (board default + calendar + thread placeholder).

- [ ] **Step 5: Commit**

```bash
git add src/components/PlanningSchedule.jsx src/components/PlanningSchedule.test.jsx
git commit -m "feat: render CalendarView for the calendar view mode"
```

---

## Task 7: Full‑suite check + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full suite + lint**

Run: `npm run test:run`
Expected: all suites PASS. If "no tests" prints, re‑run once.

Run: `npm run lint`
Expected: no errors. (Watch for unused imports / `vi.hoisted` bindings.)

- [ ] **Step 2: Manual smoke test (Task 1 SQL from #3b‑1 already applied; `npm run dev`)**

Open a trip → **Planning** → toggle **Calendar** as host/editor:

1. The grid shows a column per trip day, 00:00–23:30 rows, with any already‑timed items as blocks and no‑time items in the **Untimed** strip.
2. **Drag** a pending suggestion onto a time slot → it appears as a block at that time; refresh → persists.
3. **Drag** a block to a different time/day → it moves; two items at the same time sit **side by side**.
4. **Click** a block → the time editor opens; change start time (block moves) and duration (block resizes).
5. **✕** a block (or drag it back to Pending) → it leaves the calendar.
6. Toggle **Board ↔ Calendar** → same items, both views consistent; **Thread** shows "coming soon".
7. As a **viewer** → no drag, no ✕/editor.

- [ ] **Step 3: RLS spot‑check**

Confirm a viewer cannot drag/reschedule; a direct client `update` of `plan_items.start_time` by a non‑writer is rejected by the existing RLS.

- [ ] **Step 4: Final commit (only if touch‑ups were needed)**

```bash
git add -A
git commit -m "chore: #3b-2 calendar view — full-suite green + smoke-tested"
```

---

## Done — coverage against the spec

- §2 no schema change; reuse `useScheduleItem` → Tasks 2, 4–6 (no DB task).
- §3 architecture (`cal:` slot droppables, `computeDrop` branch, pure `lib/calendar`) → Tasks 1, 2, 5.
- §4 data flow (`partitionSchedule` split timed/untimed; `useScheduleItem`) → Tasks 5, 6.
- §5 components (`CalendarView`, `CalendarBlock`, shared `TimeEditor`, `PlanningSchedule` wiring) → Tasks 3–6.
- §6 UI (grid, parked strip, block editor, overlaps, permissions) → Tasks 4, 5.
- §7 edge cases (viewer, overlap, no‑time parked, transport no‑duration) → Tasks 1, 4, 5.
- §8 testing → the test step in every task + Task 7 full‑suite + manual drag verification.
