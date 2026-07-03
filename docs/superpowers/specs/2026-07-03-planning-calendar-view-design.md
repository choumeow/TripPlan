# TripPlan — Subsystem #3 (Slice 3b‑2): Planning — Calendar View — Design

**Date:** 2026-07-03
**Status:** Approved (design)
**Builds on:** #0–#3a, #3b‑1 Board Scheduling — see `docs/superpowers/specs/`
**Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, `@dnd-kit`, CSS Modules

---

## 1. Context & scope

#3b‑1 shipped the Board view (day columns) with drag‑to‑schedule + a Board·Calendar·Thread view
toggle, where **Calendar** is a "coming soon" placeholder. This slice makes **Calendar** real: a
time‑grid rendering of the *same* scheduled data, with drag.

**In scope (3b‑2)**

- A **multi‑day time grid** `CalendarView`: **days as columns × time as rows**, running
  **00:00–23:30 in 30‑minute slots** (vertically scrollable).
- **Drag** a suggestion from Pending onto a **(day, time) slot** → schedules it with that time;
  drag an existing block to a new time/day; drag back to Pending to unschedule.
- **Adjust time** two ways: **drag the block** (snaps to 30 min) or **click it** for an exact
  **start time + duration** editor.
- **Block height = duration**; **overlapping items sit side by side**; **no‑time items park** in a
  strip atop each day (display‑only until placed — viewing never mutates data).

**Out of scope → later**

- **Thread** view → #3b‑3. Templates → #3c. Resize‑by‑drag for duration (duration is set via the
  editor). Any schema change (none needed).

**Decisions locked in brainstorming:** multi‑day grid (not single‑day); 00:00–23:30 in 30‑min
slots; drag‑snap + click‑to‑edit; no‑time items parked and *not* persisted on view (a time is saved
only on a deliberate drop/drag); duration → block height; overlaps side by side; one shared
`TimeEditor` across Board + Calendar.

---

## 2. Data model — no change

Reuses the #3b‑1 scheduling fields: `plan_items.scheduled_date` / `start_time` / `duration_min`
and `transport.depart_date` / `depart_time` (local legs). `sort_order` is unused by the Calendar
(time‑positioned, not order‑positioned). No new columns, no new RLS — every write is an `UPDATE`
through the existing **`useScheduleItem`**, covered by the host/editor update policies.

**Transport** has no `duration_min` column → a transport block renders at a fixed minimal height and
its editor shows a start time only.

---

## 3. Architecture

### Drops react to the target, not the active view
`Planning` already runs one `DndContext` and calls `computeDrop(active, over, trip)` on drag‑end.
The Calendar makes its **slots the droppables**, so `over.id` identifies the target and no view
state needs lifting:

- Slot droppable id: **`cal:YYYY-MM-DD:HHMM`** (e.g. `cal:2026-07-04:0930`).
- Per‑day parked droppable id: **`cal:YYYY-MM-DD:untimed`**.
- **`computeDrop` gains a `cal:` branch** → returns `{ scheduledDate: date, startTime: 'HH:MM' }`
  (or `startTime: null` for the parked target). The Board's `day:` / `pending` / item‑id logic is
  untouched. One `onDragEnd` serves both views; all writes go through `useScheduleItem`.

Blocks are `@dnd-kit` **draggables** (ids `plan:<id>` / `tr:<id>`), not sortables — the Calendar
positions by time, not order. Collision detection picks the slot under the pointer. Drag is
disabled for viewers.

### Layout math is pure
**`lib/calendar.js`** holds the grid math, DnD‑free and unit‑tested:
- constants `DAY_START = 0`, `DAY_END = 23*60+30`, `SLOT = 30` (minutes);
- `timeToMin('HH:MM[:SS]')`, `minToTime(min)`, `slotId(date, min)` + `parseSlotId`;
- `calendarLayout(dayTimedItems)` → for each item `{ id, topMin, durMin, col, colCount }`, packing
  **overlapping items into side‑by‑side columns** (greedy interval‑partition).

---

## 4. Data flow

- **Read:** unchanged — `useTrip` already embeds `plan_items(*)` + `transport(*)`.
  `partitionSchedule(trip)` (from #3b‑1) gives `byDay`; the Calendar splits each day's items into
  **timed** (has `start_time`) → positioned via `calendarLayout`, and **untimed** → the parked strip.
- **Write:** the existing **`useScheduleItem`** (optimistic + rollback + invalidate). A slot drop
  sends `{ scheduledDate, startTime }`; the time editor sends `{ startTime, durationMin }`; a drop
  on Pending sends `{ scheduledDate: null }`.

---

## 5. Component / file structure

```
src/lib/calendar.js + test                 overlap-column layout + time/slot helpers + constants
src/lib/schedule.js (modify) + test        computeDrop handles cal: slot / cal:…:untimed ids
src/components/TimeEditor.jsx + test        shared start-time + duration inputs → onChange(patch)
src/components/ScheduledCard.jsx (refactor) use TimeEditor (Board + Calendar share one editor)
src/components/CalendarBlock.jsx + css + test  draggable timed block; height=duration; click→TimeEditor; ✕ unschedule
src/components/CalendarView.jsx + css + test   day columns × 30-min slot droppables + parked strip; positions blocks
src/components/PlanningSchedule.jsx (modify)   render <CalendarView> when view==='calendar'
```
`Planning.jsx` needs no drop‑logic change (its `computeDrop` now routes `cal:`); `PlanningSchedule`
forwards `canEdit` / `onSetTime` / `onRemove` to `CalendarView`. Reuses `tripDays`, `categoryMeta`,
`methodMeta`, `useScheduleItem`, `partitionSchedule`, design tokens.

---

## 6. UI

### `CalendarView`
A horizontally‑scrollable header row of day columns (`Day N · MON DD` from `tripDays`) over a
vertically‑scrollable body. Left gutter = time labels (00:00…23:30). Each day column is a stack of
**30‑min slot droppables** (`cal:date:HHMM`) with a **parked strip** on top
(`cal:date:untimed`) holding no‑time items. Timed items render as absolutely‑positioned
`CalendarBlock`s (`top = topMin`, `height = durMin`), packed into side‑by‑side columns on overlap.

### `CalendarBlock`
A draggable block showing its **time range + title**, colored by category (place)/green (stay)/teal
(transport). **Click** (without dragging) opens the inline **`TimeEditor`**; a small **✕**
unschedules (drag back to Pending also works). Height tracks `duration_min`. Gated by `canEdit`.

### `TimeEditor` (shared)
Start‑time input + duration‑minutes input (duration hidden for transport). Emits
`onChange(patch)` → `{ startTime }` / `{ durationMin }`, wired to `useScheduleItem`. Replaces the
inline editor currently inside `ScheduledCard` (light refactor; Board behavior unchanged).

### Permissions
Host/editor drag, adjust times, unschedule; **viewer** gets a read‑only grid (no drag, no
editor/✕). RLS is the real boundary.

---

## 7. Error handling & edge cases

- **Viewer** → read‑only; drag + editors disabled.
- **Overlapping items** → side‑by‑side columns via `calendarLayout`.
- **No‑time item** → parked strip; a time is written only on a deliberate drop/drag (never on view).
- **Duration overflowing 23:30** → block height clamped visually; stored value unchanged.
- **Transport (no duration)** → fixed minimal‑height block; editor shows start time only.
- **Optimistic drop fails** → `useScheduleItem` rolls back and re‑invalidates.
- **Empty day** → just empty slots; not an error.

---

## 8. Testing (Vitest + RTL)

- **`lib/calendar.js`** — `calendarLayout` (non‑overlap → 1 column; two overlapping → 2 side‑by‑side
  columns; touching‑but‑not‑overlapping → 1 column); `timeToMin`/`minToTime`/`slotId`/`parseSlotId`.
- **`lib/schedule.js` `computeDrop`** — `cal:2026-07-04:0930` → `{scheduledDate:'2026-07-04',
  startTime:'09:30'}`; `cal:2026-07-04:untimed` → `{startTime:null}`; Board cases still pass.
- **`TimeEditor`** — renders start + duration; changing each emits the right patch; duration hidden
  when `durationDisabled`.
- **`CalendarBlock`** — renders time range + title; click opens `TimeEditor`; editor change calls
  `onSetTime`; ✕ calls `onRemove`; affordances gated by `canEdit`.
- **`CalendarView`** — (wrapped in a `DndContext`) renders a column per trip day, the parked strip,
  and places a timed block in the right day; empty‑day slots render.
- **`PlanningSchedule`** — the Calendar view renders `CalendarView` (no longer the placeholder);
  Board view unchanged.
- **DnD note:** actual pointer drag isn't jsdom‑testable; the drop math (`computeDrop` cal branch)
  and layout (`lib/calendar`) are unit‑tested, and drag is verified in the manual smoke test.

---

## 9. Out of scope (restated)

Thread view (#3b‑3), templates (#3c), resize‑by‑drag, any schema/RLS change. #3b‑2 adds the Calendar
rendering + its drag over the existing scheduling model only.
