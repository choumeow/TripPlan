# Planning — Board Scheduling (#3b‑1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Planning **Board** view functional — drag a suggestion from the Pending zone onto a day column (it becomes planned and leaves pending), reorder within/between days, drag back to unschedule, set an optional time/duration — plus a Board·Calendar·Thread view toggle (Board live).

**Architecture:** Three additive `plan_items` columns (`scheduled_date`/`start_time`/`duration_min`); local transport reuses `depart_date`/`depart_time`/`sort_order`. `scheduled_date` (or `depart_date`) NULL ⇒ pending. Pure `lib/schedule.js` partitions the already‑fetched trip into `{pending, byDay}` and computes drops; one `useScheduleItem` hook persists (plan_items or transport) with optimistic cache updates. `@dnd-kit` provides one `DndContext` over both panes.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS), `@tanstack/react-query`, `@dnd-kit/core` + `@dnd-kit/sortable`, CSS Modules, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-02-planning-board-scheduling-design.md`

**Branch:** `feat/planning-board` (create at execution start; repo currently on `main`)

**Test commands:** `npm run test:run` (all) · `npx vitest run <path>` (one). If a run prints "no tests" spuriously, re‑run once (cold‑start flake on this project).

**DnD testing note:** `@dnd-kit` pointer drag needs layout measurements jsdom lacks, so **drop behavior is unit‑tested through `lib/schedule` (pure)**; the drag UI is verified in the Task 10 manual smoke test. Component tests cover rendering + non‑drag callbacks (some wrap the component in a `<DndContext>` so the sortable hooks mount).

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/schedule.js` + test | pure: `dndId`/`parseDndId`, `partitionSchedule(trip)`, `computeDrop(activeId, overId, trip)` |
| `src/hooks/useScheduleItem.js` + test | the scheduling write (plan_items \| transport), optimistic + invalidate |
| `src/components/ViewToggle.jsx` + css + test | Board \| Calendar \| Thread segmented control |
| `src/components/ScheduledCard.jsx` + css + test | compact scheduled card (dot + time + name) + time editor + ✕ remove |
| `src/components/SortableItem.jsx` | thin `useSortable` wrapper (shared by pending + day cards) |
| `src/components/DayColumn.jsx` + css + test | one droppable day column of `ScheduledCard`s |
| `src/components/PlanningSchedule.jsx` (rewrite) + css + test | view toggle + Board (day columns) / placeholders |
| `src/components/PlanningBacklog.jsx` (modify) | wrap pending cards as draggable; make the zone droppable |
| `src/pages/Planning.jsx` (modify) | `DndContext` + sensors + `onDragEnd`; owns `useScheduleItem` |

Reuses: `SuggestionCard`, `tripDates.tripDays`, `callerMember`/`canWrite`, design tokens.

---

## Task 1: Supabase backend — `plan_items` scheduling columns

SQL in the Supabase dashboard. No repo changes, no commit.

- [ ] **Step 1: Run the SQL**

```sql
alter table public.plan_items
  add column if not exists scheduled_date date,
  add column if not exists start_time    time,
  add column if not exists duration_min  int;
```

- [ ] **Step 2: Verify**

```sql
select column_name from information_schema.columns
where table_name = 'plan_items' and column_name in ('scheduled_date','start_time','duration_min')
order by column_name;
```
Expected: three rows. No new RLS (scheduling is an UPDATE, already covered by `plan_items_update_writer` / the #2a transport update policy). No commit — database only.

---

## Task 2: Add `@dnd-kit`

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install @dnd-kit/core@^6 @dnd-kit/sortable@^8`
Expected: adds both to `dependencies`; lockfile updates.

- [ ] **Step 2: Verify the build still resolves**

Run: `npm run build`
Expected: builds successfully (no missing‑module error).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for planning drag-and-drop"
```

---

## Task 3: Pure scheduling helpers — `lib/schedule.js`

**Files:** Create `src/lib/schedule.js`, `src/lib/schedule.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schedule.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { dndId, parseDndId, partitionSchedule, computeDrop } from './schedule'

const trip = {
  plan_items: [
    { id: 'a', kind: 'place', category: 'visit', title: 'A', scheduled_date: null, sort_order: 1 },
    { id: 'b', kind: 'place', category: 'meal', title: 'B', scheduled_date: '2026-07-03', start_time: '09:00:00', sort_order: 0 },
    { id: 'c', kind: 'hostel', title: 'C', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
  ],
  transport: [
    { id: 't', category: 'local', method: 'subway', from_text: 'X', to_text: 'Y', depart_date: null, sort_order: 0 },
    { id: 'j', category: 'journey', method: 'flight', from_text: 'KUL', to_text: 'HND', depart_date: '2026-07-03' },
  ],
}

describe('dnd id helpers', () => {
  it('round-trips source + id', () => {
    expect(dndId('plan', 'a')).toBe('plan:a')
    expect(dndId('transport', 't')).toBe('tr:t')
    expect(parseDndId('plan:a')).toEqual({ source: 'plan', id: 'a' })
    expect(parseDndId('tr:t')).toEqual({ source: 'transport', id: 't' })
  })
})

describe('partitionSchedule', () => {
  it('splits pending vs by-day and excludes journey transport', () => {
    const { pending, byDay } = partitionSchedule(trip)
    expect(pending.map((i) => i.dndId).sort()).toEqual(['plan:a', 'tr:t'])
    // day items ordered by time then sort_order: B (09:00) before C (no time)
    expect(byDay['2026-07-03'].map((i) => i.dndId)).toEqual(['plan:b', 'plan:c'])
    expect(byDay['2026-07-03'].some((i) => i.dndId === 'tr:j')).toBe(false)
  })
})

describe('computeDrop', () => {
  it('schedules a pending item onto a day (append) and sets its date', () => {
    const drop = computeDrop('plan:a', 'day:2026-07-04', trip)
    expect(drop.updates).toContainEqual({ source: 'plan', id: 'a', patch: { sortOrder: 0, scheduledDate: '2026-07-04' } })
  })
  it('unschedules when dropped on the pending container', () => {
    const drop = computeDrop('plan:b', 'pending', trip)
    const active = drop.updates.find((u) => u.id === 'b')
    expect(active.patch.scheduledDate).toBeNull()
  })
  it('reorders within a day when dropped over a sibling item', () => {
    const drop = computeDrop('plan:c', 'plan:b', trip) // move C above B
    expect(drop.updates.find((u) => u.id === 'c').patch.sortOrder).toBe(0)
    expect(drop.updates.find((u) => u.id === 'b').patch.sortOrder).toBe(1)
  })
  it('returns null for a no-op drop (same spot)', () => {
    expect(computeDrop('plan:b', 'plan:b', trip)).toBeNull()
    expect(computeDrop('plan:b', undefined, trip)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/schedule.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/schedule.js`:

```js
// A trip's plan_items + local transport, wrapped into a common scheduled-item shape and
// partitioned into the pending backlog vs each day. All pure — no @dnd-kit here.

export function dndId(source, id) {
  return `${source === 'transport' ? 'tr' : 'plan'}:${id}`
}
export function parseDndId(value) {
  const idx = value.indexOf(':')
  const prefix = value.slice(0, idx)
  return { source: prefix === 'tr' ? 'transport' : 'plan', id: value.slice(idx + 1) }
}

function planWrap(row) {
  return { source: 'plan', id: row.id, dndId: dndId('plan', row.id),
    day: row.scheduled_date ?? null, time: row.start_time ?? null, order: row.sort_order ?? 0, raw: row }
}
function transportWrap(row) {
  return { source: 'transport', id: row.id, dndId: dndId('transport', row.id),
    day: row.depart_date ?? null, time: row.depart_time ?? null, order: row.sort_order ?? 0, raw: row }
}

export function scheduleItems(trip) {
  const plans = (trip.plan_items ?? []).map(planWrap)
  const locals = (trip.transport ?? []).filter((t) => t.category === 'local').map(transportWrap)
  return [...plans, ...locals]
}

const byTimeThenOrder = (a, b) => (a.time ?? '~').localeCompare(b.time ?? '~') || a.order - b.order
const byOrder = (a, b) => a.order - b.order

export function partitionSchedule(trip) {
  const items = scheduleItems(trip)
  const pending = items.filter((i) => !i.day).slice().sort(byOrder)
  const byDay = {}
  for (const i of items.filter((i) => i.day)) (byDay[i.day] ??= []).push(i)
  for (const d of Object.keys(byDay)) byDay[d].sort(byTimeThenOrder)
  return { pending, byDay }
}

const dayOf = (containerId) => containerId.slice(4) // 'day:2026-07-03' -> '2026-07-03'

// activeId/overId are dnd ids (item = 'plan:x'/'tr:x'; container = 'pending'/'day:YYYY-MM-DD').
// Returns { updates: [{source,id,patch}] } to persist, or null for a no-op.
export function computeDrop(activeId, overId, trip) {
  if (!overId || activeId === overId) return null
  const { pending, byDay } = partitionSchedule(trip)
  const containers = [['pending', pending], ...Object.entries(byDay).map(([d, arr]) => [`day:${d}`, arr])]
  const listOf = (cid) => (cid === 'pending' ? pending : byDay[dayOf(cid)] ?? [])

  const active = containers.flatMap(([, arr]) => arr).find((i) => i.dndId === activeId)
  if (!active) return null
  const fromEntry = containers.find(([, arr]) => arr.some((i) => i.dndId === activeId))
  const from = fromEntry[0]

  let to, index
  if (overId === 'pending' || overId.startsWith('day:')) {
    to = overId
    index = listOf(to).filter((i) => i.dndId !== activeId).length // append to end
  } else {
    const overEntry = containers.find(([, arr]) => arr.some((i) => i.dndId === overId))
    if (!overEntry) return null
    to = overEntry[0]
    index = listOf(to).filter((i) => i.dndId !== activeId).findIndex((i) => i.dndId === overId)
  }

  const target = listOf(to).filter((i) => i.dndId !== activeId)
  const at = Math.max(0, Math.min(index, target.length))
  target.splice(at, 0, active)

  // no-op: same container, same position
  if (from === to && listOf(from).findIndex((i) => i.dndId === activeId) === at) return null

  const scheduledDate = to === 'pending' ? null : dayOf(to)
  const updates = target
    .map((i, idx) => ({ i, idx }))
    .filter(({ i, idx }) => idx !== i.order || i.dndId === activeId)
    .map(({ i, idx }) => ({
      source: i.source, id: i.id,
      patch: { sortOrder: idx, ...(i.dndId === activeId ? { scheduledDate } : {}) },
    }))
  return { activeId, from, to, updates }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/schedule.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule.js src/lib/schedule.test.js
git commit -m "feat: add pure schedule helpers (partition + computeDrop)"
```

---

## Task 4: `useScheduleItem` hook

**Files:** Create `src/hooks/useScheduleItem.js`, `src/hooks/useScheduleItem.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useScheduleItem.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, update, from, invalidate } = vi.hoisted(() => {
  const eq = vi.fn(() => Promise.resolve({ error: null }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  const invalidate = vi.fn()
  return { eq, update, from, invalidate }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate, setQueryData: vi.fn(), getQueryData: vi.fn(), cancelQueries: vi.fn() }) }
})

import { useScheduleItem } from './useScheduleItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useScheduleItem', () => {
  it('maps a plan update to plan_items columns (date/order/status)', async () => {
    const { result } = renderHook(() => useScheduleItem('t1'), { wrapper })
    result.current.mutate([{ source: 'plan', id: 'a', patch: { scheduledDate: '2026-07-04', sortOrder: 2 } }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('plan_items')
    expect(update).toHaveBeenCalledWith({ scheduled_date: '2026-07-04', status: 'planned', sort_order: 2 })
    expect(eq).toHaveBeenCalledWith('id', 'a')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
  it('sets status pending when unscheduling a plan item', async () => {
    const { result } = renderHook(() => useScheduleItem('t1'), { wrapper })
    result.current.mutate([{ source: 'plan', id: 'a', patch: { scheduledDate: null, sortOrder: 0 } }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith({ scheduled_date: null, status: 'pending', sort_order: 0 })
  })
  it('maps a transport update to transport columns (depart_date/time/order)', async () => {
    const { result } = renderHook(() => useScheduleItem('t1'), { wrapper })
    result.current.mutate([{ source: 'transport', id: 't', patch: { scheduledDate: '2026-07-04', sortOrder: 1, startTime: '10:00' } }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('transport')
    expect(update).toHaveBeenCalledWith({ depart_date: '2026-07-04', sort_order: 1, depart_time: '10:00' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useScheduleItem.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/hooks/useScheduleItem.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Map a source-agnostic patch to the columns of its table. Only include provided keys.
function planColumns(patch) {
  const row = {}
  if ('scheduledDate' in patch) { row.scheduled_date = patch.scheduledDate; row.status = patch.scheduledDate ? 'planned' : 'pending' }
  if ('sortOrder' in patch) row.sort_order = patch.sortOrder
  if ('startTime' in patch) row.start_time = patch.startTime
  if ('durationMin' in patch) row.duration_min = patch.durationMin
  return row
}
function transportColumns(patch) {
  const row = {}
  if ('scheduledDate' in patch) row.depart_date = patch.scheduledDate
  if ('sortOrder' in patch) row.sort_order = patch.sortOrder
  if ('startTime' in patch) row.depart_time = patch.startTime
  return row
}

export function useScheduleItem(tripId) {
  const queryClient = useQueryClient()
  const key = ['trip', tripId]
  return useMutation({
    mutationFn: async (updates) => {
      for (const u of updates) {
        const table = u.source === 'transport' ? 'transport' : 'plan_items'
        const columns = u.source === 'transport' ? transportColumns(u.patch) : planColumns(u.patch)
        const { error } = await supabase.from(table).update(columns).eq('id', u.id)
        if (error) throw error
      }
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      if (previous) queryClient.setQueryData(key, applyOptimistic(previous, updates))
      return { previous }
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(key, ctx.previous) },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

// Patch the cached trip so the drag looks instant before the write returns.
function applyOptimistic(trip, updates) {
  const patchRow = (row, cols) => ({ ...row, ...cols })
  const planUpd = new Map(updates.filter((u) => u.source === 'plan').map((u) => [u.id, planColumns(u.patch)]))
  const trUpd = new Map(updates.filter((u) => u.source === 'transport').map((u) => [u.id, transportColumns(u.patch)]))
  return {
    ...trip,
    plan_items: (trip.plan_items ?? []).map((r) => (planUpd.has(r.id) ? patchRow(r, planUpd.get(r.id)) : r)),
    transport: (trip.transport ?? []).map((r) => (trUpd.has(r.id) ? patchRow(r, trUpd.get(r.id)) : r)),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useScheduleItem.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScheduleItem.js src/hooks/useScheduleItem.test.jsx
git commit -m "feat: add useScheduleItem mutation (optimistic schedule write)"
```

---

## Task 5: `ViewToggle`

**Files:** Create `src/components/ViewToggle.jsx`, `.module.css`, `ViewToggle.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ViewToggle.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewToggle } from './ViewToggle'

describe('ViewToggle', () => {
  it('renders the three views and marks the active one', () => {
    render(<ViewToggle view="board" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Thread' })).toBeInTheDocument()
  })
  it('calls onChange with the chosen view', async () => {
    const onChange = vi.fn()
    render(<ViewToggle view="board" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(onChange).toHaveBeenCalledWith('calendar')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ViewToggle.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ViewToggle.jsx`:

```jsx
import styles from './ViewToggle.module.css'

const VIEWS = [
  { key: 'board', label: 'Board' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'thread', label: 'Thread' },
]

export function ViewToggle({ view, onChange }) {
  return (
    <div className={styles.toggle} role="group" aria-label="View">
      {VIEWS.map((v) => (
        <button key={v.key} type="button"
          className={`${styles.btn} ${view === v.key ? styles.on : ''}`}
          aria-pressed={view === v.key} onClick={() => onChange(v.key)}>
          {v.label}
        </button>
      ))}
    </div>
  )
}
```

Create `src/components/ViewToggle.module.css`:

```css
.toggle { display: inline-flex; gap: 2px; background: var(--c-mist); border: 1px solid var(--border); border-radius: 999px; padding: 3px; }
.btn { font-size: 13px; font-weight: 600; color: var(--ink-muted); background: transparent; border: none; border-radius: 999px; padding: 5px 14px; cursor: pointer; }
.on { color: var(--primary-strong); background: #fff; box-shadow: 0 1px 3px rgba(15,23,42,0.1); }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ViewToggle.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ViewToggle.jsx src/components/ViewToggle.module.css src/components/ViewToggle.test.jsx
git commit -m "feat: add ViewToggle (board/calendar/thread)"
```

---

## Task 6: `ScheduledCard`

**Files:** Create `src/components/ScheduledCard.jsx`, `.module.css`, `ScheduledCard.test.jsx`

Presentational only (no DnD); DnD wrapping is done by `SortableItem` in Task 7.

- [ ] **Step 1: Write the failing test**

Create `src/components/ScheduledCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduledCard } from './ScheduledCard'

const card = { title: 'Ichiran', color: '#F59E0B', time: '09:00:00', durationMin: 60 }

describe('ScheduledCard', () => {
  it('renders the time chip and name', () => {
    render(<ScheduledCard card={card} canEdit={false} onSetTime={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('Ichiran')).toBeInTheDocument()
  })
  it('hides edit affordances for viewers', () => {
    render(<ScheduledCard card={card} canEdit={false} onSetTime={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /set time/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })
  it('lets an editor open the time editor and set a start time', async () => {
    const onSetTime = vi.fn()
    render(<ScheduledCard card={card} canEdit onSetTime={onSetTime} onRemove={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /set time/i }))
    const input = screen.getByLabelText(/start/i)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(input, { target: { value: '10:30' } })
    expect(onSetTime).toHaveBeenCalledWith({ startTime: '10:30' })
  })
  it('removes from the day', async () => {
    const onRemove = vi.fn()
    render(<ScheduledCard card={card} canEdit onSetTime={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ScheduledCard.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ScheduledCard.jsx`:

```jsx
import { useState } from 'react'
import styles from './ScheduledCard.module.css'

export function ScheduledCard({ card, canEdit, onSetTime, onRemove }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className={styles.card}>
      <span className={styles.dot} style={{ background: card.color }} />
      {card.time && <span className={styles.time}>{card.time.slice(0, 5)}</span>}
      <span className={styles.nm}>{card.title}</span>
      {canEdit && (
        <span className={styles.acts}>
          <button type="button" className={styles.ibtn} aria-label={`Set time for ${card.title}`}
            onClick={() => setEditing((e) => !e)}>⏰</button>
          <button type="button" className={styles.ibtn} aria-label={`Remove ${card.title} from day`}
            onClick={onRemove}>✕</button>
        </span>
      )}
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
    </div>
  )
}
```

Create `src/components/ScheduledCard.module.css`:

```css
.card { display: flex; align-items: center; gap: 7px; background: #fff; border: 1px solid var(--border); border-radius: 9px; padding: 7px 9px; box-shadow: 0 1px 4px rgba(15,23,42,0.05); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.time { font-size: 11px; font-weight: 700; color: var(--primary-strong); background: var(--c-mist); border-radius: 5px; padding: 1px 5px; flex: none; }
.nm { font-size: 12px; font-weight: 600; color: var(--ink); flex: 1; min-width: 0; }
.acts { display: flex; gap: 3px; flex: none; }
.ibtn { font-size: 11px; color: var(--ink-muted); background: none; border: none; cursor: pointer; }
.editor { flex-basis: 100%; display: flex; gap: 10px; margin-top: 6px; }
.lbl { display: flex; flex-direction: column; font-size: 10px; color: var(--ink-muted); gap: 2px; }
.editor input { font-size: 12px; padding: 3px 5px; border: 1.5px solid var(--border); border-radius: 6px; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ScheduledCard.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ScheduledCard.jsx src/components/ScheduledCard.module.css src/components/ScheduledCard.test.jsx
git commit -m "feat: add compact ScheduledCard with time editor"
```

---

## Task 7: `SortableItem` + `DayColumn`

**Files:** Create `src/components/SortableItem.jsx`, `src/components/DayColumn.jsx`, `.module.css`, `DayColumn.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/DayColumn.test.jsx` (wraps in a `<DndContext>` so the sortable hooks mount):

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { DayColumn } from './DayColumn'

function renderCol(cards) {
  return render(
    <DndContext>
      <DayColumn date="2026-07-03" label="Day 1 · JUL 03" cards={cards} canEdit
        onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('DayColumn', () => {
  it('renders its header and each scheduled card', () => {
    renderCol([
      { dndId: 'plan:b', title: 'B', color: '#0EA5E9', time: '09:00:00' },
      { dndId: 'plan:c', title: 'C', color: '#22C55E', time: null },
    ])
    expect(screen.getByText('Day 1 · JUL 03')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })
  it('shows a drop placeholder when empty', () => {
    renderCol([])
    expect(screen.getByText(/drop a suggestion here/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/DayColumn.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SortableItem`**

Create `src/components/SortableItem.jsx`:

```jsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// A thin drag wrapper: makes `children` draggable/sortable under the id, unless disabled.
export function SortableItem({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    touchAction: 'none',
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
```

Note: `@dnd-kit/utilities` ships as a dependency of `@dnd-kit/sortable`; if the import fails, add it with `npm install @dnd-kit/utilities` and amend the Task 2 commit.

- [ ] **Step 4: Implement `DayColumn`**

Create `src/components/DayColumn.jsx`:

```jsx
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
```

Create `src/components/DayColumn.module.css`:

```css
.day { border: 1px solid var(--border); border-radius: var(--radius-md); background: #fbfdff; min-height: 320px; display: flex; flex-direction: column; }
.head { font-size: 12px; font-weight: 700; color: #334155; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.body { padding: 10px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.over { background: var(--c-mist); }
.drop { height: 66px; border: 1.5px dashed var(--border); border-radius: var(--radius-md); display: grid; place-items: center; font-size: 11px; color: var(--ink-muted); text-align: center; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/DayColumn.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/SortableItem.jsx src/components/DayColumn.jsx src/components/DayColumn.module.css src/components/DayColumn.test.jsx
git commit -m "feat: add SortableItem + DayColumn (droppable day)"
```

---

## Task 8: Rewrite `PlanningSchedule` (view toggle + Board)

**Files:** Modify `src/components/PlanningSchedule.jsx`, `src/components/PlanningSchedule.module.css`; rewrite `src/components/PlanningSchedule.test.jsx`

- [ ] **Step 1: Replace the test**

Replace `src/components/PlanningSchedule.test.jsx` with:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import { PlanningSchedule } from './PlanningSchedule'

const trip = {
  start_date: '2026-07-03', end_date: '2026-07-05',
  plan_items: [{ id: 'b', kind: 'place', category: 'meal', title: 'B', scheduled_date: '2026-07-03', start_time: '09:00:00', sort_order: 0 }],
  transport: [],
}

function renderSched() {
  return render(
    <DndContext>
      <PlanningSchedule trip={trip} canEdit onSetTime={vi.fn()} onRemove={vi.fn()} />
    </DndContext>,
  )
}

describe('PlanningSchedule', () => {
  it('shows the Board by default with a column per trip day and scheduled items placed', () => {
    renderSched()
    expect(screen.getByText(/Day 1 · JUL 03/)).toBeInTheDocument()
    expect(screen.getByText(/Day 3 · JUL 05/)).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument() // placed on Day 1
  })
  it('switches to Calendar/Thread placeholders via the toggle', async () => {
    renderSched()
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
    expect(screen.queryByText(/Day 1 · JUL 03/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/PlanningSchedule.test.jsx`
Expected: FAIL — the old component renders static day columns and no toggle.

- [ ] **Step 3: Rewrite the component**

Replace `src/components/PlanningSchedule.jsx` with:

```jsx
import { useState } from 'react'
import { tripDays, monthDay } from '../lib/tripDates'
import { partitionSchedule } from '../lib/schedule'
import { categoryMeta } from '../lib/placeCategories'
import { methodMeta } from '../lib/transport'
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
```

- [ ] **Step 4: Update the stylesheet**

Replace `src/components/PlanningSchedule.module.css` with:

```css
.wrap { min-width: 0; }
.head { display: flex; justify-content: flex-end; margin-bottom: var(--space-3); }
.days { display: grid; grid-auto-flow: column; grid-auto-columns: 190px; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); }
.soon { padding: var(--space-7) var(--space-5); text-align: center; font-size: 14px; color: var(--ink-muted); border: 1.5px dashed var(--border); border-radius: var(--radius-md); }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/PlanningSchedule.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/PlanningSchedule.jsx src/components/PlanningSchedule.module.css src/components/PlanningSchedule.test.jsx
git commit -m "feat: PlanningSchedule board view + view toggle"
```

---

## Task 9: Wire DnD in `Planning` + make pending cards draggable

**Files:** Modify `src/pages/Planning.jsx`, `src/components/PlanningBacklog.jsx`, `src/pages/Planning.test.jsx`

- [ ] **Step 1: Make pending cards draggable + zone droppable**

In `src/components/PlanningBacklog.jsx`, add imports at the top:

```jsx
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SortableItem } from './SortableItem'
import { dndId } from '../lib/schedule'
```

Then wrap the whole returned `<section>` body so the zone is droppable, and wrap each `SuggestionCard` in a `SortableItem`. Replace the `return (` block's `<section>` opening and the card `.map` with:

```jsx
  const { setNodeRef } = useDroppable({ id: 'pending' })
  const allIds = [
    ...items.map((i) => dndId('plan', i.id)),
    ...locals.map((l) => dndId('transport', l.id)),
  ]

  return (
    <section ref={setNodeRef}>
      {/* ...the existing filter bar stays unchanged... */}
      <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
        {groups.map((g) => (
          <div key={g.key} className={styles.group}>
            <div className={styles.head}>
              <span className={styles.gtitle}><span aria-hidden="true">{g.icon}</span> {g.label} ({g.cards.length})</span>
            </div>
            {g.cards.length === 0 ? (
              <p className={styles.empty}>Nothing here yet</p>
            ) : (
              <div className={styles.grid}>
                {g.cards.map((card) => (
                  <SortableItem key={card.key} id={dndId(card.source, card.raw.id)} disabled={!canEdit}>
                    <SuggestionCard card={card} canEdit={canEdit}
                      onEdit={() => onEdit(card.source, card.raw)} onRemove={() => onRemove(card.source, card.raw)} />
                  </SortableItem>
                ))}
              </div>
            )}
          </div>
        ))}
      </SortableContext>
    </section>
  )
```

Keep the filter‑bar `<div className={styles.bar}>…</div>` exactly as it is, between `<section ref={setNodeRef}>` and the `<SortableContext>`. (The `card.source`/`card.raw` fields already exist on the view‑models built by `planItemCard`/`transportCard`.)

- [ ] **Step 2: Rewrite `Planning` as the DnD coordinator**

Replace `src/pages/Planning.jsx` with:

```jsx
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { computeDrop } from '../lib/schedule'
import { PlanningBacklog } from '../components/PlanningBacklog'
import { PlanningSchedule } from '../components/PlanningSchedule'
import { SuggestionEditorModal } from '../components/SuggestionEditorModal'
import { useDeletePlanItem } from '../hooks/useDeletePlanItem'
import { useDeleteTransport } from '../hooks/useDeleteTransport'
import { useScheduleItem } from '../hooks/useScheduleItem'
import styles from './Planning.module.css'

export function Planning() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)
  const [editor, setEditor] = useState(null)
  const delPlan = useDeletePlanItem(trip.id)
  const delTransport = useDeleteTransport(trip.id)
  const schedule = useScheduleItem(trip.id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function handleEdit(source, raw) {
    setEditor(source === 'transport' ? { transportLeg: raw } : { planItem: raw })
  }
  function handleRemove(source, raw) {
    if (!window.confirm('Remove this suggestion?')) return
    if (source === 'transport') delTransport.mutate(raw.id)
    else delPlan.mutate(raw.id)
  }
  function handleDragEnd(event) {
    const drop = computeDrop(event.active.id, event.over?.id, trip)
    if (drop) schedule.mutate(drop.updates)
  }
  // A scheduled card asks to change its time; card.dndId encodes source+id.
  function handleSetTime(card, patch) {
    const source = card.dndId.startsWith('tr:') ? 'transport' : 'plan'
    const id = card.dndId.slice(card.dndId.indexOf(':') + 1)
    schedule.mutate([{ source, id, patch }])
  }
  function handleUnschedule(card) {
    const source = card.dndId.startsWith('tr:') ? 'transport' : 'plan'
    const id = card.dndId.slice(card.dndId.indexOf(':') + 1)
    schedule.mutate([{ source, id, patch: { scheduledDate: null, sortOrder: 0 } }])
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Planning</h1>
        {canEdit && (
          <button type="button" className={styles.add} onClick={() => setEditor({ initialType: 'visit' })}>
            + Add suggestion
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className={styles.panes}>
          <div className={styles.pending}>
            <p className={styles.zone}>Pending · suggestions</p>
            <PlanningBacklog trip={trip} canEdit={canEdit} onEdit={handleEdit} onRemove={handleRemove} />
          </div>
          <div className={styles.plan}>
            <p className={styles.zone}>Planning schedule</p>
            <PlanningSchedule trip={trip} canEdit={canEdit} onSetTime={handleSetTime} onRemove={handleUnschedule} />
          </div>
        </div>
      </DndContext>

      {editor && (
        <SuggestionEditorModal
          tripId={trip.id} memberId={me?.id ?? null}
          initialType={editor.initialType} planItem={editor.planItem} transportLeg={editor.transportLeg}
          onClose={() => setEditor(null)} />
      )}
    </section>
  )
}
```

- [ ] **Step 3: Update the Planning test**

The existing `src/pages/Planning.test.jsx` mocks `PlanningBacklog` and `PlanningSchedule`, so `DndContext` renders fine with mocked children. Add a `useScheduleItem` mock so the real hook doesn't run — insert after the `useDeleteTransport` mock line:

```jsx
vi.mock('../hooks/useScheduleItem', () => ({ useScheduleItem: () => ({ mutate: vi.fn() }) }))
```

Update the `PlanningSchedule` mock line to accept the new props (still just renders a marker):

```jsx
vi.mock('../components/PlanningSchedule', () => ({ PlanningSchedule: () => <div>Schedule</div> }))
```
(No assertion changes — the three existing tests still hold: both panes render, header Add gated by `canEdit`, Add opens the modal.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/pages/Planning.test.jsx src/components/PlanningBacklog.test.jsx`
Expected: PASS. (PlanningBacklog's tests render it **without** a `DndContext`; `useDroppable`/`useSortable` no‑op safely outside a context in @dnd-kit v6 — if any test errors on a missing context, wrap the `render(<PlanningBacklog…/>)` calls in `<DndContext>…</DndContext>` and import it from `@dnd-kit/core`.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Planning.jsx src/components/PlanningBacklog.jsx src/pages/Planning.test.jsx
git commit -m "feat: wire @dnd-kit drag-to-schedule into the Planning board"
```

---

## Task 10: Full‑suite check + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full suite + lint**

Run: `npm run test:run`
Expected: all suites PASS. If "no tests" prints, re‑run once.

Run: `npm run lint`
Expected: no errors. (Watch for unused `vi.hoisted` bindings and unused imports.)

- [ ] **Step 2: Manual smoke test (Task 1 SQL applied, `npm run dev`)**

Open a trip → **Planning** as host/editor:

1. **Drag** a pending card onto **Day 1** → it leaves Pending and appears in Day 1; refresh → it persists.
2. **Reorder** two cards within a day by dragging; **drag** one to another day.
3. On a scheduled card, **⏰** set a start time → the time chip shows and the day re‑sorts by time; set duration.
4. **✕** a scheduled card (or drag it back to the Pending zone) → it returns to Pending.
5. Switch the **view toggle** to Calendar/Thread → "coming soon"; back to Board → items intact.
6. As a **viewer** → no drag, no ⏰/✕, no + Add.

- [ ] **Step 3: RLS spot‑check**

Confirm in‑app that a viewer cannot drag/schedule; a direct client `update` of `plan_items.scheduled_date` by a non‑writer is rejected by the existing RLS.

- [ ] **Step 4: Final commit (only if touch‑ups were needed)**

```bash
git add -A
git commit -m "chore: #3b-1 board scheduling — full-suite green + smoke-tested"
```

---

## Done — coverage against the spec

- §2 data model (`plan_items` columns; transport reuse; no new RLS) → Task 1.
- §3 DnD architecture (`@dnd-kit`, containers, sensors, computeDrop, optimistic) → Tasks 2, 3, 7, 9.
- §4 data flow (`partitionSchedule`, `useScheduleItem`) → Tasks 3, 4.
- §5 UI (Planning coordinator, pending draggable, schedule zone, ViewToggle, ScheduledCard) → Tasks 5–9.
- §6 edge cases (viewer read‑only, no‑op drop, optimistic rollback, no‑time transport) → Tasks 3, 4, 6, 9.
- §8 testing → the test step in every task + Task 10 full‑suite + manual drag verification.
