# Planning Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four Planning UX fixes — reliable/responsive drag, calendar block resize-to-set-duration, shorter pending cards, and a backlog that shows only unscheduled suggestions.

**Architecture:** No schema change. Fix drag by switching the pointer sensor from delay+tolerance activation (which cancels quick drags) to a distance constraint. Add a bottom resize handle to `CalendarBlock` driven by a pure `resizeDuration` snap in `lib/calendar.js`, persisting via the existing `useScheduleItem`. Filter `PlanningBacklog` to unscheduled items. Shrink the suggestion card via CSS.

**Tech Stack:** React 19 + Vite, `@dnd-kit/core`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-planning-polish-design.md`.

**Harness note (every task):** vitest v4 here intermittently fails a fresh/edited test file's FIRST run with a spurious "reading 'config'" / "no tests" error. Re-run the same `npx vitest run <file>` once or twice; only a real assertion diff counts. Run single files, not the whole suite (except the final task).

---

## File structure

```
src/lib/calendar.js (modify)                 add resizeDuration(startMin, rawMin)
src/lib/calendar.test.js (modify)            test resizeDuration
src/components/CalendarBlock.jsx (modify)    bottom resize handle (plan-only, canEdit) + live height preview
src/components/CalendarBlock.module.css (modify)  .resize handle style (+ ensure .block is positioned)
src/components/CalendarBlock.test.jsx (modify)    handle gated by source/canEdit; drag persists snapped durationMin
src/components/PlanningBacklog.jsx (modify)  filter plan_items/local transport to unscheduled
src/components/PlanningBacklog.test.jsx (modify)  a scheduled item is absent
src/pages/Planning.jsx (modify)              PointerSensor → { distance: 8 }; TouchSensor { delay:200, tolerance:6 }
src/components/SuggestionCard.module.css (modify)  shorter front face
```

---

## Task 1: `lib/calendar.resizeDuration` — snap + clamp

**Files:** Modify `src/lib/calendar.js`, `src/lib/calendar.test.js`.

- [ ] **Step 1: Add the failing test** — append to `src/lib/calendar.test.js`:
```js
import { resizeDuration } from './calendar'

describe('resizeDuration', () => {
  it('snaps to the nearest 30-min slot', () => {
    expect(resizeDuration(540, 105)).toBe(120) // 09:00 start, 105 → 120
    expect(resizeDuration(540, 100)).toBe(90)  // 100 → 90
  })
  it('floors at one slot (never below 30 min)', () => {
    expect(resizeDuration(540, 5)).toBe(30)
    expect(resizeDuration(540, -20)).toBe(30)
  })
  it('never extends past midnight (1440 − start)', () => {
    expect(resizeDuration(1380, 200)).toBe(60) // 23:00 start → cap at 60 min
  })
})
```
(If `src/lib/calendar.test.js` already has an `import { ... } from './calendar'` line, add `resizeDuration` to it instead of a second import — either works.)

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/calendar.test.js` → FAIL (`resizeDuration` not exported).

- [ ] **Step 3: Add the implementation** — append to `src/lib/calendar.js` (after `parseSlotId`, before `calendarLayout`):
```js
// New duration (minutes) for a block resized to `rawMin`, snapped to the 30-min grid,
// floored at one slot, and clamped so the block never runs past midnight.
export function resizeDuration(startMin, rawMin) {
  const snapped = Math.max(SLOT, Math.round(rawMin / SLOT) * SLOT)
  return Math.min(snapped, 1440 - startMin)
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/calendar.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/calendar.js src/lib/calendar.test.js
git commit -m "feat: resizeDuration snap+clamp for calendar block resize"
```

---

## Task 2: `CalendarBlock` — bottom resize handle

**Files:** Modify `src/components/CalendarBlock.jsx`, `src/components/CalendarBlock.module.css`, `src/components/CalendarBlock.test.jsx`.

- [ ] **Step 1: Add the failing tests** — add to `src/components/CalendarBlock.test.jsx` inside `describe('CalendarBlock', …)`:
```js
  it('resizes a plan block via the bottom handle and persists a snapped duration', () => {
    const onSetTime = vi.fn()
    renderBlock({ onSetTime })
    const handle = screen.getByTestId('resize')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 145, pointerId: 1 }) // +45px → 60+45=105 → snap 120
    fireEvent.pointerUp(handle, { clientY: 145, pointerId: 1 })
    expect(onSetTime).toHaveBeenCalledWith({ durationMin: 120 })
  })
  it('shows no resize handle for transport or for viewers', () => {
    const { rerender } = renderBlock({ card: { ...card, source: 'transport' } })
    expect(screen.queryByTestId('resize')).not.toBeInTheDocument()
    rerender(
      <DndContext>
        <CalendarBlock card={card} style={{}} canEdit={false} onSetTime={vi.fn()} onRemove={vi.fn()} />
      </DndContext>,
    )
    expect(screen.queryByTestId('resize')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/components/CalendarBlock.test.jsx` → FAIL (no `resize` testid).

- [ ] **Step 3: Rewrite `CalendarBlock.jsx`** with the resize handle:
```js
import { useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { timeToMin, minToTime, resizeDuration } from '../lib/calendar'
import styles from './CalendarBlock.module.css'

export function CalendarBlock({ card, style, canEdit, onSetTime, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [previewDur, setPreviewDur] = useState(null)
  const startRef = useRef(null)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.dndId, disabled: !canEdit })
  const startMin = timeToMin(card.time)
  const dur = previewDur ?? card.durationMin
  const label = startMin != null
    ? `${minToTime(startMin)}${dur ? `–${minToTime(startMin + dur)}` : ''}`
    : ''
  const canResize = canEdit && card.source === 'plan' && startMin != null
  const merged = {
    ...style,
    background: card.color,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
    ...(previewDur != null ? { height: previewDur } : {}),
  }

  function onResizeDown(e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startRef.current = { y: e.clientY, dur: card.durationMin ?? 30 }
  }
  function onResizeMove(e) {
    if (!startRef.current) return
    const raw = startRef.current.dur + (e.clientY - startRef.current.y)
    setPreviewDur(resizeDuration(startMin, raw))
  }
  function onResizeUp(e) {
    if (!startRef.current) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const final = previewDur
    startRef.current = null
    setPreviewDur(null)
    if (final != null && final !== card.durationMin) onSetTime({ durationMin: final })
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
      {canResize && (
        <div data-testid="resize" className={styles.resize} aria-label={`Resize ${card.title}`}
          onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
          onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add the handle CSS** — append to `src/components/CalendarBlock.module.css`:
```css
.block { position: relative; }
.resize { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; cursor: ns-resize; touch-action: none; }
.resize::after { content: ''; display: block; width: 22px; height: 3px; margin: 2px auto 0; border-radius: 2px; background: rgba(255, 255, 255, 0.75); }
```
(If `.block` already has a `position` rule, leave the existing one and drop the `.block { position: relative; }` line — the `.x` remove button is absolutely positioned, so `.block` is almost certainly already `position: relative`; keep only one.)

- [ ] **Step 5: Run tests to verify they pass** — `npx vitest run src/components/CalendarBlock.test.jsx` → PASS (all: existing 4 + 2 new).

- [ ] **Step 6: Commit**
```bash
git add src/components/CalendarBlock.jsx src/components/CalendarBlock.module.css src/components/CalendarBlock.test.jsx
git commit -m "feat: drag a calendar block's bottom edge to set its duration"
```

---

## Task 3: `PlanningBacklog` — show only unscheduled

**Files:** Modify `src/components/PlanningBacklog.jsx`, `src/components/PlanningBacklog.test.jsx`.

- [ ] **Step 1: Add the failing test** — in `src/components/PlanningBacklog.test.jsx`, extend the `trip` fixture so one plan item and one local transport are *scheduled*, then assert they're absent. Add a new test after the existing `groups items…` test:
```js
  it('excludes items that are already scheduled (they live in the schedule, not the backlog)', () => {
    const scheduledTrip = {
      ...trip,
      plan_items: [
        ...trip.plan_items,
        { id: 'p3', kind: 'place', category: 'museum', title: 'Scheduled Museum', scheduled_date: '2026-07-04', created_by: 'm1' },
      ],
      transport: [
        ...trip.transport,
        { id: 'l2', category: 'local', method: 'subway', from_text: 'C', to_text: 'D', depart_date: '2026-07-04', created_by: 'm1' },
      ],
    }
    render(<PlanningBacklog trip={scheduledTrip} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('TNM')).toBeInTheDocument()                  // unscheduled still shows
    expect(screen.queryByText('Scheduled Museum')).not.toBeInTheDocument()
    expect(screen.queryByText(/^C → D/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/PlanningBacklog.test.jsx` → FAIL (scheduled items still rendered).

- [ ] **Step 3: Filter to unscheduled** — in `src/components/PlanningBacklog.jsx`, change the two source lines (currently `const items = trip.plan_items ?? []` and `const locals = (trip.transport ?? []).filter((t) => t.category === 'local')`):
```js
  const items = (trip.plan_items ?? []).filter((i) => !i.scheduled_date)
  const locals = (trip.transport ?? []).filter((t) => t.category === 'local' && !t.depart_date)
```
Everything downstream (`groups`, `allIds`, the `SortableContext`) already derives from `items`/`locals`, so no other change is needed.

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/PlanningBacklog.test.jsx` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/PlanningBacklog.jsx src/components/PlanningBacklog.test.jsx
git commit -m "feat: pending backlog shows only unscheduled suggestions"
```

---

## Task 4: Drag sensor (B1) + shorter cards (B3) + full suite + lint

**Files:** Modify `src/pages/Planning.jsx`, `src/components/SuggestionCard.module.css`, then run the whole suite + lint.

- [ ] **Step 1: Switch the pointer sensor to distance activation** — in `src/pages/Planning.jsx`, the sensors block is currently:
```js
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )
```
Replace it with:
```js
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
```
(Pointer drag now starts after an 8px move with no hold and no cancellation window; touch keeps a hold-delay so finger scrolling still works.)

- [ ] **Step 2: Shorten the suggestion card** — in `src/components/SuggestionCard.module.css`:
  - change `.flip { perspective: 1000px; height: 132px; }` → `height: 104px`
  - change `.fbody { padding: 10px 12px; … }` → `padding: 8px 12px;`
  - change `.nm { … margin: 0 0 6px; … }` → `margin: 0 0 4px;`

- [ ] **Step 3: Run the full suite** — `npx vitest run` → all pass (existing Planning/Calendar/Backlog/Card tests + the new ones). If the whole suite cold-flakes to "no tests", re-run once.

- [ ] **Step 4: Lint** — `npm run lint` → clean. Fix anything introduced (e.g. an unused import).

- [ ] **Step 5: Commit**
```bash
git add src/pages/Planning.jsx src/components/SuggestionCard.module.css
git commit -m "feat: responsive drag (distance activation) + shorter pending cards"
```

---

## Task 5: Manual verification & wrap-up

- [ ] **Step 1: Smoke-test** — `npm run dev`, open a trip → Planning:
  - Drag a suggestion card into the schedule with a quick flick — it drags immediately (no hold, no dropped drags). Clicking a card still flips it / opens ✎.
  - In **Calendar** mode, drag a scheduled plan block's bottom edge — its height snaps in 30-min steps and the time range label updates; releasing persists (survives reload). A transport block has no resize handle.
  - Scheduling a suggestion removes it from the left backlog; clicking ✕ / cancel on the block returns it to the backlog.
  - Pending cards are visibly shorter.
- [ ] **Step 2: Final full test + lint** — `npx vitest run && npm run lint` → all green.
- [ ] **Step 3: Note in the roadmap memory** (optional) that Planning got a drag/resize/backlog polish pass.

---

## Self-review notes (author)

- **Spec coverage:** B1 (distance sensor) → Task 4 Step 1; B2 (resize) → Tasks 1–2; B3 (shorter cards) → Task 4 Step 2; B4 (unscheduled backlog) → Task 3.
- **Type consistency:** `resizeDuration(startMin, rawMin)` defined in Task 1, imported + called in Task 2. The resize persists via `onSetTime({ durationMin })` — the same shape `Planning.handleSetTime` already forwards to `useScheduleItem` (whose `planColumns` maps `durationMin → duration_min`). Backlog filter keys: `scheduled_date` (plan_items) / `depart_date` (transport) match `schedule.js`'s `planWrap`/`transportWrap`.
- **No placeholders:** every code/test step has full code + exact commands. B3 is CSS-only (no test, per spec).
- **jsdom note:** the resize handler uses `setPointerCapture?.()` (optional — jsdom may not implement it); the test fires pointer events directly on the handle, so capture isn't needed for the test. Pointer events dispatch in this project's jsdom (the existing CalendarBlock test relies on pointerdown behavior).
```
