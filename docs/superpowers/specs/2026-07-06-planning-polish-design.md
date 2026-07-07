# TripPlan — Planning Polish (drag / calendar resize / backlog) — Design

**Date:** 2026-07-06
**Status:** Approved (design)
**Builds on:** Planning #3a/#3b (Board · Calendar · Thread views, all merged)
**Stack:** React 19 + Vite, `@dnd-kit/core` + `@dnd-kit/sortable`, CSS Modules, Vitest + RTL

---

## 1. Context & scope

Four UX polish changes to the existing Planning views. No schema change, no new tables.

- **B1 — Drag responsiveness.** Dragging suggestions/blocks is laggy and "sometimes can't drag."
- **B2 — Calendar resize.** A scheduled block in Calendar mode can be dragged by its bottom edge to
  set its **time-slot duration** ("book the slot").
- **B3 — Shorter pending cards.** Reduce the suggestion cards' height so more fit at a glance.
- **B4 — Backlog = unscheduled only.** A suggestion leaves the pending backlog once scheduled and
  returns when unscheduled.

**Out of scope:** any data-model change; resizing transport blocks (no duration); resizing from the
top edge (start-time change — that stays in the existing time editor); Board/Thread resize.

---

## 2. B1 — Drag responsiveness (root cause + fix)

`src/pages/Planning.jsx` configures `PointerSensor` with `activationConstraint: { delay: 150, tolerance: 5 }`.
That requires holding still for 150 ms before a drag begins, **and cancels the drag** if the pointer
moves more than 5 px during those 150 ms — so a quick drag gesture is dropped ("can't drag").

**Fix:** replace the pointer activation with a **distance** constraint: `{ distance: 8 }`. A drag
starts as soon as the pointer moves 8 px, with no hold and no cancellation window. Plain clicks
(flip card, ✎/✕, open the time editor) still register because they don't move the pointer. The
`TouchSensor` keeps a delay-based constraint (`{ delay: 200, tolerance: 6 }`) so touch **scrolling**
still works (a distance constraint on touch would hijack scroll). `KeyboardSensor` unchanged.

---

## 3. B2 — Calendar resize to set duration

The Calendar grid is 30-min slots at 1 px/min (`SLOT = 30`, `SLOT_PX = 30`, `DAY_END = 23:30` in
`lib/calendar.js`). A block's height already reflects `duration_min`.

- **Resize handle:** `CalendarBlock` renders a thin drag strip at its **bottom edge**, shown only when
  `canEdit` **and** `card.source === 'plan'` (transport has no duration).
- **Interaction:** the handle uses its **own pointer handlers** (`onPointerDown` → `setPointerCapture`,
  track `startY` + starting duration; `onPointerMove` → live-preview height; `onPointerUp` → persist),
  and **`stopPropagation`** so it never triggers the block's dnd-kit move-drag.
- **Snap + clamp (pure, in `lib/calendar.js`):**
  ```
  resizeDuration(startMin, rawMin) ->
    snapped = max(SLOT, round(rawMin / SLOT) * SLOT)   // nearest 30 min, min one slot
    return min(snapped, 1440 - startMin)               // never past midnight
  ```
  where `rawMin = startDuration + pointerDeltaPx` (1 px = 1 min). Only blocks with a start time can
  be resized (an untimed block has no height to drag).
- **Persist:** on release, call the page's `onSetTime(card, { durationMin })`, which already routes
  through `useScheduleItem` (its `planColumns` maps `durationMin → duration_min`). No new hook.

---

## 4. B3 — Shorter pending cards

`SuggestionCard` (backlog face) has a fixed height sized for the hover-flip. Reduce the front-face
height + padding in `SuggestionCard.module.css` so the grid packs tighter. Purely CSS — the flip,
availability line, avatar, and ✎/✕ all remain; the back face keeps its scroll for overflow.

---

## 5. B4 — Backlog shows only unscheduled

`PlanningBacklog` currently maps **all** `trip.plan_items` and all local `trip.transport`. Filter both
to the **unscheduled** set:

- places/stays: `plan_items` where `scheduled_date == null`
- local transport: `transport` where `category === 'local' && depart_date == null`

Because the schedule's ✕ / cancel already sets `scheduled_date` / `depart_date` back to `null` (via
`useScheduleItem`), an unscheduled item **reappears** in the backlog automatically on the next render —
no new state or handler. The `SortableContext` id list is built from the same filtered set.

---

## 6. Component / file structure

```
src/pages/Planning.jsx (modify)          PointerSensor → { distance: 8 }; TouchSensor { delay:200, tolerance:6 }
src/lib/calendar.js (modify)             add resizeDuration(startMin, rawMin) (snap + clamp)
src/lib/calendar.test.js (modify/new)    test resizeDuration
src/components/CalendarBlock.jsx (modify) + .module.css   bottom resize handle (plan-only, canEdit) + live preview
src/components/CalendarBlock.test.jsx (modify)            handle shown only for plan + canEdit; resize persists durationMin
src/components/PlanningBacklog.jsx (modify)               filter to unscheduled; test updated
src/components/PlanningBacklog.test.jsx (modify)          scheduled item is absent; unscheduled present
src/components/SuggestionCard.module.css (modify)         shorter front face
```

Reuses `useScheduleItem`, `computeDrop`, `partitionSchedule`, the existing DnD wiring — none of which change.

---

## 7. Testing

- **`lib/calendar.resizeDuration`** — snaps to 30-min (round up/down), floors at one slot, clamps at
  midnight (`1440 - startMin`).
- **`CalendarBlock`** — resize handle renders only for `source==='plan'` + `canEdit`; a simulated
  drag on the handle calls `onSetTime` with a snapped `durationMin`; no handle for transport / viewer.
- **`PlanningBacklog`** — a `plan_items` row with a `scheduled_date` is **not** rendered; one without is;
  same for local transport `depart_date`.
- **Sensors** — Planning wires a distance-based pointer sensor (assert via the sensor options where
  practical; otherwise covered by the existing drag tests still passing).
- **B3** is CSS-only (no test).

---

## 8. Out of scope (restated)

Data-model changes; transport-duration resize; top-edge (start-time) resize; Board/Thread resizing;
touch-drag redesign. Those stay as-is.
