# TripPlan — Subsystem #3 (Slice 3b‑3): Planning — Thread View — Design

**Date:** 2026-07-03
**Status:** Approved (design)
**Builds on:** #0–#3a, #3b‑1 Board, #3b‑2 Calendar — see `docs/superpowers/specs/`
**Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, `@dnd-kit`, CSS Modules

---

## 1. Context & scope

#3b‑1 shipped the Board and the Board·Calendar·Thread toggle; #3b‑2 shipped the Calendar. **Thread**
is still a "coming soon" placeholder. This slice makes it real — the last of the three planning views.

**In scope (3b‑3)**

- A **whole‑trip vertical timeline** `ThreadView`: read top‑to‑bottom as a narrative itinerary. Each
  trip day is a **timeline‑rail divider** (a vertical line with a dot, `Day N · MON DD · count`),
  followed by that day's scheduled items as full‑width rows in **time‑then‑order**.
- **Drag** to reorder within a day, **move across day dividers**, **schedule from Pending**, and
  **unschedule** by dragging a row back to Pending.
- Set/adjust a row's time via the row's existing time editor. Empty days show a "drop here" target.

**Out of scope → later:** Templates (#3c). No schema change; no new drop logic; no new hook.

**Decisions locked in brainstorming:** whole‑trip timeline (not one‑day‑at‑a‑time); the **timeline‑rail**
aesthetic (vertical line + dots) over plain dividers.

---

## 2. Architecture — reuse, not reinvention

The Thread is **order‑based, exactly like the Board**, so it reuses the Board's entire drag pipeline:

- Each day section is a **`day:date` droppable + a `SortableContext`** whose items are the same
  `plan:<id>` / `tr:<id>` ids. Therefore **`computeDrop`'s existing board branch handles every thread
  drop** — reorder within a day, move across dividers, schedule from `pending`, unschedule back to
  `pending`. **No new drop code, no `computeDrop` change.**
- `Planning.jsx` needs **no change**: its single `<DndContext onDragEnd={computeDrop → useScheduleItem}>`
  already services `day:` / `pending` drops regardless of which view rendered the containers.
- Data comes from `partitionSchedule(trip).byDay` (time‑then‑order, from #3b‑1); writes go through the
  existing **`useScheduleItem`** (optimistic + rollback). No schema/RLS change.

---

## 3. Component / file structure

```
src/components/ThreadView.jsx + css + test    whole-trip timeline: per trip day → a rail divider
                                                (Day N · MON DD · count) + a droppable/sortable list of
                                                ScheduledCard rows; empty day → "drop here"
src/components/PlanningSchedule.jsx (modify) + test   render <ThreadView> when view==='thread'
```

Reuses: `ScheduledCard` (time chip + shared `TimeEditor` + ✕), `SortableItem`, `tripDays`,
`partitionSchedule`, `computeDrop` (via `Planning`), `useScheduleItem`, design tokens. `Planning.jsx`
unchanged.

---

## 4. UI

### `ThreadView`
A single vertical, scrollable column with a **timeline rail** down the left (a vertical line; each day
divider carries a dot). For every `tripDays(trip)` day:

- a **divider** — the rail dot + `Day N · MON DD` + a muted item count;
- the day's items (`partitionSchedule().byDay[date]`, already ordered time‑then‑order) as full‑width
  rows, each a **`ScheduledCard`** wrapped in a `SortableItem` (id `plan:`/`tr:`);
- an **empty day** → a dashed "nothing planned — drop here" row that is still the `day:date` drop target
  (each day section is a `useDroppable({ id: 'day:'+date })` so empty days accept drops).

A row shows: category color dot, time chip (if set), name, and — for host/editor — the ✎ time editor
(`ScheduledCard`'s existing `TimeEditor`) and a ✕ that unschedules. Drag a row to reorder / move to
another day; drag from Pending in; drag a row to the Pending zone to unschedule.

### Permissions
Host/editor drag + edit + unschedule; **viewer** gets a read‑only timeline (no drag, no ✎/✕). RLS is
the real boundary.

---

## 5. Error handling & edge cases

- **Viewer** → read‑only (drag + editors disabled via `SortableItem disabled` / `canEdit`).
- **Empty day** → "drop here" placeholder that still accepts drops; not an error.
- **Optimistic drop fails** → `useScheduleItem` rolls back and re‑invalidates.
- **Board/Calendar unaffected** — Thread only adds a renderer; the shared `computeDrop` / `useScheduleItem`
  are untouched.

---

## 6. Testing (Vitest + RTL)

- **`ThreadView`** — (wrapped in a `<DndContext>`) renders a rail divider per trip day with the correct
  `Day N · MON DD`; a day's items appear in order; an empty day shows the "drop here" placeholder; ✎/✕
  affordances gated by `canEdit`.
- **`PlanningSchedule`** — the Thread view renders `ThreadView` (no longer the "coming soon" placeholder);
  Board and Calendar views unchanged.
- **Drop math** is already covered by the Board's `computeDrop` tests (Thread reuses the `day:`/`pending`
  logic); actual `@dnd-kit` pointer drag isn't jsdom‑testable and is verified in the manual smoke test.

---

## 7. Out of scope (restated)

Templates (#3c); Packing/Finance/Discussion (#4–#6); any change to the scheduling model, `computeDrop`,
`useScheduleItem`, or the Board/Calendar views. #3b‑3 adds the Thread renderer + its `PlanningSchedule`
wiring only — completing the three planning views.
