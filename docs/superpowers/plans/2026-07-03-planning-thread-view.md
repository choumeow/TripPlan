# Planning — Thread View (#3b‑3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Planning **Thread** view real — a whole‑trip vertical timeline (timeline‑rail day dividers + item rows) rendering the same scheduled data, with drag to reorder within a day, move across days, schedule from Pending, and unschedule.

**Architecture:** Pure reuse. Each day section is a `day:date` droppable + `SortableContext` with the same `plan:`/`tr:` item ids, so the Board's existing `computeDrop` (routed by `Planning`'s one `onDragEnd`) handles every thread drop — no new drop code, no schema change, no hook change, no `Planning.jsx` change. Reuses `ScheduledCard`, `SortableItem`, `partitionSchedule`, `tripDays`, `useScheduleItem`.

**Tech Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, `@dnd-kit/core` + `@dnd-kit/sortable`, CSS Modules, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-03-planning-thread-view-design.md`

**Branch:** `feat/planning-thread` (create at execution start; repo currently on `main`)

**Test commands:** `npx vitest run <path>` (one) · `npm run test:run` (all). A run sometimes prints "Test Files N failed / no tests" on the FIRST invocation — a known cold‑start flake on this repo; RE‑RUN once. Do NOT reinstall packages or use `--pool=vmThreads`.

**DnD testing note:** `@dnd-kit` pointer drag isn't jsdom‑testable; the thread reuses the Board's `computeDrop` (already unit‑tested), and drag is verified in the Task 3 manual smoke test.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/components/ThreadView.jsx` + css + test | whole‑trip timeline: per trip day → a rail divider + a droppable/sortable list of `ScheduledCard` rows; empty day → "drop here" |
| `src/components/PlanningSchedule.jsx` (modify) + test | render `<ThreadView>` when `view==='thread'` |

No change to `Planning.jsx`, `computeDrop`, `useScheduleItem`, or the DB.

---

## Task 1: `ThreadView`

**Files:** Create `src/components/ThreadView.jsx`, `.module.css`, `ThreadView.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ThreadView.test.jsx` (wrapped in a `<DndContext>` so the sortable hooks mount):

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { ThreadView } from './ThreadView'

const trip = {
  start_date: '2026-07-03', end_date: '2026-07-05', trip_members: [],
  plan_items: [
    { id: 'a', kind: 'place', category: 'meal', title: 'Ichiran', scheduled_date: '2026-07-03', start_time: '09:00:00', sort_order: 0 },
    { id: 'b', kind: 'place', category: 'visit', title: 'Senso-ji', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
  ],
  transport: [],
}

function renderThread(canEdit = true) {
  return render(
    <DndContext>
      <ThreadView trip={trip} canEdit={canEdit} onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('ThreadView', () => {
  it('renders a rail divider per trip day', () => {
    renderThread()
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 2 · JUL 04/)).toBeInTheDocument()
    expect(screen.getByText(/Day 3 · JUL 05/)).toBeInTheDocument()
  })
  it('lists a day\'s items in order and shows a placeholder for empty days', () => {
    renderThread()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()
    expect(screen.getByText('Senso-ji')).toBeInTheDocument()
    // Day 2 and Day 3 are empty → two "drop here" placeholders
    expect(screen.getAllByText(/nothing planned/i)).toHaveLength(2)
  })
  it('hides edit affordances for viewers', () => {
    renderThread(false)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ThreadView.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ThreadView.jsx`:

```jsx
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
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/ThreadView.module.css`:

```css
.rail { position: relative; max-width: 640px; padding-left: 26px; }
.rail::before { content: ''; position: absolute; left: 9px; top: 10px; bottom: 10px; width: 2px; background: var(--border); }
.day { margin-bottom: var(--space-4); }
.divider { position: relative; display: flex; align-items: baseline; gap: 6px; margin: 0 0 var(--space-2); }
.dot { position: absolute; left: -21px; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); border: 2px solid #fff; box-shadow: 0 0 0 2px var(--primary); }
.dlabel { font-size: 13px; font-weight: 800; color: #334155; letter-spacing: 0.01em; }
.count { font-size: 12px; font-weight: 600; color: var(--ink-muted); }
.list { display: flex; flex-direction: column; gap: 6px; border-radius: var(--radius-md); }
.over { background: var(--c-mist); }
.empty { font-size: 12px; color: var(--ink-muted); border: 1.5px dashed var(--border); border-radius: 9px; padding: 12px; text-align: center; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/ThreadView.test.jsx`
Expected: PASS (3 tests). If the first run prints "no tests", re‑run once.

- [ ] **Step 6: Commit**

```bash
git add src/components/ThreadView.jsx src/components/ThreadView.module.css src/components/ThreadView.test.jsx
git commit -m "feat: add ThreadView (whole-trip timeline)"
```

---

## Task 2: Render `ThreadView` from `PlanningSchedule`

**Files:** Modify `src/components/PlanningSchedule.jsx`; modify `src/components/PlanningSchedule.test.jsx`

- [ ] **Step 1: Update the test**

In `src/components/PlanningSchedule.test.jsx`, add a `ThreadView` mock next to the existing `CalendarView` mock (near the top, before `import { PlanningSchedule }`):

```jsx
vi.mock('./ThreadView', () => ({ ThreadView: () => <div>ThreadView</div> }))
```

Then replace the existing `'shows a coming-soon placeholder for Thread'` test with:

```jsx
  it('switches to the Thread view', async () => {
    renderSched()
    await userEvent.click(screen.getByRole('button', { name: 'Thread' }))
    expect(screen.getByText('ThreadView')).toBeInTheDocument()
    expect(screen.queryByText(/Day 1 · JUL 03/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/PlanningSchedule.test.jsx`
Expected: FAIL — clicking Thread still shows the "coming soon" text, not `ThreadView`.

- [ ] **Step 3: Update the component**

In `src/components/PlanningSchedule.jsx`, add the import next to the `CalendarView` import:

```jsx
import { ThreadView } from './ThreadView'
```

Then replace the thread branch:

```jsx
      {view === 'thread' && (
        <div className={styles.soon}>The thread view is coming soon.</div>
      )}
```

with:

```jsx
      {view === 'thread' && (
        <ThreadView trip={trip} canEdit={canEdit} onSetTime={onSetTime} onRemove={onRemove} />
      )}
```

(The `.soon` CSS rule is now unused — harmless to leave; remove it from `PlanningSchedule.module.css` if you want it tidy.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/PlanningSchedule.test.jsx`
Expected: PASS — board default + calendar + thread all render their real components.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlanningSchedule.jsx src/components/PlanningSchedule.test.jsx
git commit -m "feat: render ThreadView for the thread view mode"
```

---

## Task 3: Full‑suite check + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full suite + lint**

Run: `npm run test:run`
Expected: all suites PASS. If "no tests" prints, re‑run once.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Manual smoke test (`npm run dev`)**

Open a trip → **Planning** → toggle **Thread** as host/editor:

1. The timeline shows a rail divider per trip day (`Day N · MON DD · count`), each day's items in order,
   and empty days as a "nothing planned — drop here" row.
2. **Drag** a pending suggestion onto a day → it appears under that day; refresh → persists.
3. **Reorder** two rows within a day; **drag** a row to another day's section.
4. **Click** a row's ✎ → set a time (the day re‑sorts by time); **✕** (or drag back to Pending) → it leaves.
5. Toggle **Board ↔ Calendar ↔ Thread** → the same items appear consistently in all three.
6. As a **viewer** → no drag, no ✎/✕.

- [ ] **Step 3: RLS spot‑check**

Confirm a viewer cannot drag/reschedule; a non‑writer's direct `plan_items` update is rejected by the
existing RLS (unchanged this slice).

- [ ] **Step 4: Final commit (only if touch‑ups were needed)**

```bash
git add -A
git commit -m "chore: #3b-3 thread view — full-suite green + smoke-tested"
```

---

## Done — coverage against the spec

- §2 architecture (reuse `day:` droppables + `computeDrop`; no new drop/hook/schema) → Task 1 (uses `day:${date}` droppables; no other change).
- §3 files (`ThreadView`, `PlanningSchedule` wiring) → Tasks 1, 2.
- §4 UI (timeline rail, day dividers, rows via `ScheduledCard`, empty‑day placeholder, permissions) → Task 1.
- §5 edge cases (viewer read‑only, empty day, optimistic via `useScheduleItem`) → Tasks 1, 3.
- §6 testing → the test step in Tasks 1–2 + Task 3 full‑suite + manual drag verification.
