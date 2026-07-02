# TripPlan — Subsystem #3 (Slice 3b‑1): Planning — Board Scheduling — Design

**Date:** 2026-07-02
**Status:** Approved (design)
**Builds on:** #0 Foundation, #1 Dashboard, #2a Overview, #2b Invitations, #3a Suggestions Backlog — see `docs/superpowers/specs/`
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, `@dnd-kit`, CSS Modules

---

## 1. Context & scope

#3a shipped the Planning page as two panes: a **Pending** suggestions backlog (left) and a
non‑functional **Planning schedule** placeholder of empty day columns (right). This slice makes
scheduling real.

#3 Planning is split; #3b (real planning) is itself split into three build slices that share one
scheduling data model:

- **#3b‑1 (this slice)** — the **shared scheduling data model** + the **Board view with full
  drag‑and‑drop** + a **view toggle** (Board · Calendar · Thread) with Board live.
- **#3b‑2** — the **Calendar** view (time‑grid) reading/writing the same data.
- **#3b‑3** — the **Thread** view (chronological) reading/writing the same data.

**In scope (3b‑1)**

- Drag a suggestion from **Pending** onto a **day column** → it becomes *planned* and leaves
  Pending (**move** semantics).
- **Reorder** within a day, **move** between days, **drag back to Pending** to unschedule.
- Set an **optional start time + duration** on a scheduled card.
- A **view toggle**; Board is functional, Calendar/Thread are "coming soon" placeholders.
- `@dnd-kit` for accessible pointer/touch/keyboard drag.

**Out of scope → later slices**

- Calendar & Thread view internals → #3b‑2 / #3b‑3.
- Planning **templates** → #3c.
- Any change to journey transport (Overview, #2a) or the Pending add/edit flow (#3a).

**Decisions locked in brainstorming:** move (not copy); ordered list + optional time (not a forced
time‑grid); one shared dataset across all three views with the view toggle re‑laying it out; drag
will eventually work in every view, built slice‑by‑slice; `@dnd-kit`.

---

## 2. Data model — additive, no new tables or policies

The pending↔planned split is driven by **one field per table: the scheduled date is NULL ⇒
pending, set ⇒ planned on that day.** Both tables map to a common concept **{ day, time, order }**.

### `plan_items` (places / stays) — add three columns
```sql
alter table public.plan_items
  add column if not exists scheduled_date date,   -- NULL = pending; a date = planned on that day
  add column if not exists start_time    time,    -- optional
  add column if not exists duration_min  int;      -- optional
```
- `sort_order` (already exists) = order within a day (and within the pending group).
- `status` is kept in sync (`'planned'` when `scheduled_date` is set, else `'pending'`), but
  **`scheduled_date` is the source of truth** — a single field, no drift.

### `transport` (local legs) — no new columns
Reuse existing columns: `depart_date` (the scheduled day; NULL = pending), `depart_time`
(optional), `sort_order` (within‑day order).

### RLS
**Nothing new.** Scheduling is an `UPDATE`, already covered by the host/editor update policies on
`plan_items` (#3a) and `transport` (#2a). Viewers cannot write; the UI disables drag and RLS is the
real boundary.

---

## 3. Drag‑and‑drop architecture (`@dnd-kit`)

One `<DndContext>` wraps the whole planning board (drag must span Pending → day columns).

- **Droppable containers:** the **Pending** zone (id `pending`) and **each day column**
  (id `day:YYYY-MM-DD`).
- **Sortable items:** every card, id‑tagged by source — `plan:<id>` (places/stays) or
  `tr:<id>` (local transport) — so a drop knows which table to write. A `SortableContext` per
  container handles within‑column ordering; cross‑container moves resolve in `onDragEnd`.
- **Sensors:** Pointer + Touch + Keyboard, with a **press‑delay activation (~150 ms)** so a quick
  hover still flips a pending card to its details while a **press‑and‑hold picks it up**. Drag is
  disabled entirely when `!canEdit`.
- **`onDragEnd`** computes, via `lib/schedule.computeDrop`: the target container → new **scheduled
  day** (`null` if dropped on Pending, else the column's date) and new **sort_order** (slotted
  between neighbours; the affected day is re‑indexed client‑side and only changed rows persist),
  then fires `useScheduleItem`.
- **Optimism:** an optimistic `setQueryData(['trip', tripId])` moves the card instantly; the
  mutation persists and a final invalidate reconciles. On error, react‑query rolls back (card snaps
  back).

---

## 4. Data flow

- **Read:** no new read — `useTrip` already embeds `plan_items(*)` and `transport(*)`. The board
  derives everything from the one trip object via pure helpers in **`lib/schedule.js`**:
  - `partitionSchedule(trip)` → `{ pending, byDay }`, where `pending` = plan_items with
    `scheduled_date == null` + local transport with `depart_date == null` (grouped as in #3a), and
    `byDay[date]` = items scheduled to that day, ordered by `start_time` then `sort_order`. Journey
    transport is excluded.
  - `computeDrop(active, over, trip)` → `{ source, id, scheduledDate|null, sortOrder }` for a drop
    (returns `null` for a no‑op / same‑spot drop).
  - `reindexDay(items)` → normalised `sort_order` values for a day after an insert/move.
- **Write:** one hook, both for drops and time edits:
  ```
  useScheduleItem(tripId)
    input: { source:'plan'|'transport', id, patch }
      patch = { scheduledDate|null, sortOrder?, startTime?, durationMin? }
    plan       → update plan_items set scheduled_date, status, sort_order, start_time, duration_min
    transport  → update transport  set depart_date, depart_time, sort_order
    optimistic setQueryData + invalidate ['trip', tripId]; rollback on error
  ```
  A drop sends `scheduledDate` + `sortOrder` (+ sibling reindex patches); a time edit sends
  `startTime` + `durationMin`.

---

## 5. UI

### `Planning` page (DnD coordinator)
Wraps both panes in one `<DndContext onDragEnd>`, owns `useScheduleItem`, keeps the #3a two‑pane
layout, and derives role/permissions as before (`callerMember` + `canWrite`).

### Left — Pending zone
The existing grouped `PlanningBacklog`, but each flip `SuggestionCard` is wrapped as a draggable
(press‑delay activation, so hover‑flip and press‑drag coexist). The whole zone is a droppable
(`pending`); dropping a scheduled card here **unschedules** it (`scheduled_date` → NULL).

### Right — Schedule zone (`PlanningSchedule` rewritten)
- A **`ViewToggle`** (Board · Calendar · Thread) in the header.
- **Board** (live): one `DayColumn` per `tripDays(trip)`, each a droppable + `SortableContext`.
- **Calendar / Thread:** a "coming soon" panel in #3b‑1 (built in #3b‑2/#3b‑3). Toggle state is
  local component state.

### `ScheduledCard` (compact; fits a narrow column)
Color dot + **time chip** (if `start_time` set) + name + category. A **⏰ set time** control opens
start‑time + duration inputs (writes via `useScheduleItem`); an **✕** removes it from the day
(unschedule). Click expands full details (reuses the flip/back content). Edit affordances gated by
`canEdit`. Empty day → the "drop a suggestion here" placeholder.

### Permissions
Host/editor can drag, set times, and unschedule; viewer gets a read‑only board (no drag, no
✕/⏰). UI mirrors the rules for UX; RLS is the real boundary.

---

## 6. Error handling & edge cases

- **Viewer** → drag disabled; read‑only board.
- **Drop on the same position / no move** → `computeDrop` returns `null`; no write.
- **Optimistic drop fails** → react‑query rolls back and re‑invalidates; the card snaps back.
- **Local transport with no time** → renders without a time chip; allowed on any day.
- **Scheduled item whose day falls outside the trip window** (e.g. dates later shortened) → it
  won't match a visible column; treated as pending so it is never lost. (Full reconciliation later.)
- **Load/mutation failure** → inline error, mirrors #3a. Empty day → placeholder, not an error.

---

## 7. Component / file structure

```
src/lib/schedule.js + test                partitionSchedule(trip)→{pending,byDay}; computeDrop(); reindexDay()
src/hooks/useScheduleItem.js + test       scheduling write (plan_items | transport); optimistic + invalidate
src/components/ViewToggle.jsx +css +test  Board | Calendar | Thread segmented control
src/components/DayColumn.jsx +css +test   one droppable/sortable day column
src/components/ScheduledCard.jsx +css +test  compact scheduled card + time editor + remove‑from‑day
src/components/PlanningSchedule.jsx (rewrite) +css  view toggle + Board (day columns) / placeholders
src/pages/Planning.jsx (modify) +css      DndContext + onDragEnd + useScheduleItem; draggable pending cards
```
Adds `@dnd-kit` (`@dnd-kit/core` + `@dnd-kit/sortable`) to dependencies. Reuses from #3a:
`PlanningBacklog`, `SuggestionCard`, `tripDates.tripDays`, `lib/planItems`, `callerMember`/
`canWrite`, design tokens. Each unit stays single‑purpose: `schedule.js` holds all pure
partition/drop logic; `useScheduleItem` is the only write; the board components render/drag; the
page coordinates DnD.

---

## 8. Testing (Vitest + React Testing Library)

- **`lib/schedule.js`** — `partitionSchedule` (pending vs by‑day; journey transport excluded;
  ordering by time then sort_order); `computeDrop` (target day/order, unschedule→null, same‑spot
  no‑op, source tagging); `reindexDay`.
- **`useScheduleItem`** — plan vs transport column mapping; optimistic cache update + invalidation;
  rollback on error.
- **`ViewToggle`** — renders three options, marks active, calls `onChange`.
- **`ScheduledCard`** — time chip renders when set; ⏰ edit calls the time write; ✕ unschedules;
  editor gated by `canEdit`.
- **`DayColumn`** — renders its items in order; empty placeholder.
- **`PlanningSchedule`** — board active by default; calendar/thread show placeholders.
- **DnD wiring note:** `@dnd-kit`'s pointer drag needs layout measurements jsdom lacks, so the
  **drop math is tested through `lib/schedule` (pure)** and full drag is verified in the **manual
  smoke test**, not simulated in jsdom.
- **RLS** — SQL/manual check: a viewer cannot update a plan_item's `scheduled_date`; a non‑member
  is denied.

---

## 9. Out of scope (restated)

Calendar view (#3b‑2), Thread view (#3b‑3), templates (#3c), Packing/Finance/Discussion (#4–#6).
#3b‑1 delivers the scheduling data model, the Board view with drag, and the view toggle only.
