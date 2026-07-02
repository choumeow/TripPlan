# TripPlan — Subsystem #3 (Slice 3a): Planning — Suggestions Backlog — Design

**Date:** 2026-07-02
**Status:** Approved (design)
**Builds on:** Foundation (#0), Projects & Dashboard (#1), Project Shell + Overview (#2a), Invitations & Notifications (#2b) — see `docs/superpowers/specs/`
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 1. Context & scope

`/trip/:tripId/planning` is currently a "coming soon" stub. This slice makes it real as the
**Suggestions Backlog**: a pool of *ideas* — places, stays, and local transport — that
host/editors drop in **without a trip-schedule date/time**. It's the "here's stuff we might
want to do" stage.

#3 (Planning) is split into three slices:

- **#3a (this slice)** — the pending **suggestions backlog**: the `plan_items` table, local
  transport on the existing `transport` table, the adaptive add/edit form, the grouped backlog
  with an availability filter, and the hover-flip suggestion card.
- **#3b** — **real planning**: take suggestions and **assign + confirm a date/time** (scheduling
  UI + drag & drop from the backlog into day containers).
- **#3c** — **templates** that jump-start #3b (a starting layout the user then adjusts in #3b).

**In scope (3a):** `plan_items` table + RLS; a `note` column on `transport`; the `/planning`
page (replacing the stub); the adaptive `SuggestionEditorModal`; the `PlanningBacklog` (grouped
sections + availability filter); the `SuggestionCard` flip card; read via an extended `useTrip`;
create/edit/remove for host/editors.

**Out of scope → later slices:** any trip-schedule date/time assignment, day containers, drag &
drop, calendar/board/thread views (#3b/#3c); Packing/Finance/Discussion (#4–#6).

**Terminology:** a place's **availability** = its own opening hours / valid dates (reference
info that helps planning in #3b) — NOT a chosen visit slot.

---

## 2. Data model + RLS

### New table: `plan_items` (places + stays; explicit columns)

Chosen over a `details jsonb` blob or per-kind tables: the field set is now well-defined and
stable, and explicit columns are type-safe and easy to unit-test (this project is TDD-heavy).
This amends the Foundation canonical map (which sketched `plan_items` with a `details jsonb`);
transport was already split out to its own table in #2a, so `plan_items` here covers **place +
hostel only**.

```
plan_items
  id            uuid pk default gen_random_uuid()
  trip_id       uuid not null references trips(id) on delete cascade
  kind          text not null check (kind in ('place','hostel'))
  category      text            -- place category (visit|meal|shopping|museum|other); null for hostel
  title         text not null
  location      text            -- detail location / address
  link          text            -- website / social / booking
  description   text
  price_range   text
  avail_days    int[]           -- opening days of week (0=Sun..6=Sat) — drives the filter
  avail_open    time
  avail_close   time
  avail_start_date date          -- optional "only between" window start (festivals/pop-ups)
  avail_end_date   date          -- optional window end
  check_in_date  date            -- hostel only
  check_out_date date            -- hostel only
  status        text not null default 'pending'   -- 'planned' arrives in #3b
  sort_order    int not null default 0
  created_by    uuid references trip_members(id) on delete set null
  created_at    timestamptz not null default now()
```

```sql
create index on public.plan_items (trip_id);
alter table public.plan_items enable row level security;

create policy "plan_items_select_member" on public.plan_items
  for select using (public.is_trip_member(trip_id));
create policy "plan_items_insert_writer" on public.plan_items
  for insert with check (public.trip_role(trip_id) in ('host','editor'));
create policy "plan_items_update_writer" on public.plan_items
  for update using (public.trip_role(trip_id) in ('host','editor'))
            with check (public.trip_role(trip_id) in ('host','editor'));
create policy "plan_items_delete_writer" on public.plan_items
  for delete using (public.trip_role(trip_id) in ('host','editor'));

grant select, insert, update, delete on public.plan_items to authenticated;
```

Reuses the existing `SECURITY DEFINER` helpers `is_trip_member` / `trip_role`; no RPC needed —
these are plain RLS-guarded client writes (no chicken-and-egg, unlike `create_trip`).

### `transport` table — one additive change

Local transport suggestions reuse the existing `transport` table with **`category='local'`**,
`direction=null`, `depart_date/depart_time=null`, and `method / from_text / to_text / reference`.
Add one optional column for the suggestion note (benefits journey legs too):

```sql
alter table public.transport add column if not exists note text;
```

The existing `transport` RLS (member select; host/editor insert/update/delete, from #2a) already
covers local rows. The `category` CHECK already allows `'local'`.

---

## 3. Category & type config (single source of truth)

Per the one-source-of-truth rule (label + color defined together):

`src/lib/placeCategories.js`
```
PLACE_CATEGORIES = {
  visit:    { label: 'Visit',    color: '#0EA5E9' },
  meal:     { label: 'Meal',     color: '#F59E0B' },
  shopping: { label: 'Shopping', color: '#EC4899' },
  museum:   { label: 'Museum',   color: '#A855F7' },
  other:    { label: 'Other',    color: '#64748B' },
}
```

`src/lib/suggestionTypes.js` — drives the adaptive add form. Each selectable "type" maps to a
save target and identity. Stay = green, Transport = teal.
```
SUGGESTION_TYPES = [
  ...place categories -> { target: 'plan_items', kind: 'place', category: <key>, color },
  { key:'stay',      label:'Stay',      color:'#22C55E', target:'plan_items', kind:'hostel' },
  { key:'transport', label:'Transport', color:'#14B8A6', target:'transport' },
]
```

---

## 4. Data flow

- **Read** — extend `useTrip`'s embedded select to also pull `plan_items(*)`:
  ```js
  '*, trip_members(id, user_id, display_name, role, invite_status, profiles(display_name, avatar_url)), transport(*), plan_items(*)'
  ```
  The trip shell fetches the trip once and passes it through `<Outlet context={{trip}}>`; the
  Planning page reads `trip.plan_items` (places/stays) and `trip.transport` filtered to
  `category==='local'`. One round-trip, no N+1 — same pattern Overview uses for journey transport.
- **Mutations (all invalidate `['trip', tripId]`):**
  - `useUpsertPlanItem(tripId)` — insert (no `id`) / update (with `id`) a place|hostel.
  - `useDeletePlanItem(tripId)` — delete by `id`.
  - Local transport **reuses** `useUpsertTransport` / `useDeleteTransport`, with
    `useUpsertTransport` generalized to accept `category` (default `'journey'`) and a nullable
    `direction`, so local saves with `category:'local', direction:null, depart_date/time:null`.

---

## 5. UI

### `Planning` page — two-pane layout
A page header (title + a **single host/editor "+ Add suggestion"** button that opens the editor)
over a **side-by-side** two-pane grid (stacks on narrow screens):

- **Left — Pending zone (`PlanningBacklog`):** the suggestions backlog (built in #3a).
- **Right — Planning schedule zone (`PlanningSchedule`):** the day-by-day plan. **In #3a this is a
  non-functional preview** — empty day columns (Day 1…N from the trip dates) with a
  "coming soon" note. #3c seeds it from templates; #3b makes the columns real drop targets (drag
  suggestions in) with times.

The page reads `trip` from outlet context, derives caller role (`callerMember` + `canWrite`), and
owns the editor-modal state. Everything the user adds lands in the **pending** zone; scheduling
into days is #3b.

### `PlanningBacklog` (the pending zone)
- Three grouped sections — **📍 Places / 🏨 Stays / 🚆 Local transport** — each with a count.
  There is **no per-section Add** (the one "+ Add suggestion" lives in the page header). Empty
  group → "Nothing here yet".
- **Availability filter bar:** a date input **clamped to the trip window** (`min=start_date`,
  `max=end_date`) + optional time + Clear. When active: place cards surface their 🕒 availability
  and **non-matching places dim** (never hidden — nothing vanishes silently); stays & local
  transport always pass the filter.

### `PlanningSchedule` (the planning-schedule zone)
- Renders one column per trip day (`tripDates.tripDays`), each headed "Day N · MON DD" with a
  dashed "drop a suggestion here" placeholder. Non-functional in #3a; horizontally scrollable.

### `SuggestionCard` (flip card)
- **Hover → flip to back** (full info; back scrolls if long; no title on the back to maximise
  room). **Pointer-down / press → force front** (the compact face dragged into the template in
  #3b). **Touch:** tap toggles flip; a drag press shows front. Honors `prefers-reduced-motion`
  (cross-fade instead of 3D flip).
- **Front:** color stripe (category color), name, category pill, 🕒 availability line (only when
  filtering), added-by avatar/name.
- **Back:** Available + Location + Price + Link + Description (and check-in/out for stays, route
  for transport), then ✎/✕ for host/editors (with `stopPropagation` so they don't trigger
  flip/drag).

### `SuggestionEditorModal` (adaptive; reuses `Modal`)
- **Name** first → **type chips** (Visit/Meal/Shopping/Museum/Other · Stay · Transport, colored)
  → fields reveal per type from `suggestionTypes`:
  - **Place types** → location*, link, description, price range, **opening hours** = day chips*
    (Mon–Sun) + open* / close* + optional date-range window.
  - **Stay** → location*, link, description, price range, **check-in* / check-out***.
  - **Transport** → method chips (method-aware from*/to*/reference labels, reusing the transport
    method config) + note.
- **Save routes by target:** place/hostel → `useUpsertPlanItem`; transport → `useUpsertTransport`
  (`category:'local'`). ✎ reopens pre-filled (edit = update); ✕ removes after a confirm.
- Inline error on failure; modal stays open with input preserved; submit disabled while pending.

### Permissions
Caller role from the loaded members; **host/editor** see + Add / ✎ / ✕, **viewer** gets a
read-only backlog. The UI mirrors the rules for UX only — RLS is the real boundary.

---

## 6. Validation (client mirror; DB/RLS is the trust boundary)

- **Place:** name, location, category, ≥1 availability day + open + close required; link,
  description, price range, date-range window optional.
- **Stay:** name, location, check-in, check-out required (check-out ≥ check-in); link,
  description, price range optional.
- **Transport:** method, from, to required; reference (method-dependent) + note optional.

---

## 7. Error handling & edge cases

- **Load fails** → inline error + retry (mirrors the Overview/dashboard pattern); never a blank page.
- **Empty backlog** → each section shows a "Nothing here yet" line; the schedule shows empty day columns.
- **Viewer** → read-only page (no + Add / edit / remove affordances).
- **Save fails** (network/validation) → inline modal error; modal stays open, input preserved.
- **Filter with no matches in a group** → that group's cards **dim** rather than disappear, so
  nothing silently vanishes.
- **`created_by` nulled** (a member removed in #2b) → the card still renders ("Added by —").
- **`prefers-reduced-motion`** → cross-fade instead of the 3D flip.

---

## 8. Component / file structure

```
src/lib/placeCategories.js                 category → {label, color} (single source of truth)
src/lib/suggestionTypes.js                 add-form type list → {target, kind, category, color}
src/lib/planItems.js                       pure: blank form per type, rowToForm/formToRow,
                                             availabilityMatches(item, date, time), availabilityLabel(item)
src/lib/tripDates.js (modify)              add tripDays(trip) → [{index, date}] for the schedule columns
src/hooks/useTrip.js (modify)              add plan_items(*) to the embedded select
src/hooks/useUpsertPlanItem.js             insert/update a place|hostel
src/hooks/useDeletePlanItem.js             delete a plan item
src/hooks/useUpsertTransport.js (modify)   accept category (default 'journey') + nullable direction
src/components/SuggestionCard.jsx + css    flip card (hover→back, press→front); editor ✎/✕ on back
src/components/SuggestionEditorModal.jsx + css  adaptive add/edit form (name → type → fields)
src/components/PlanningBacklog.jsx + css   the pending zone: availability filter + 3 grouped sections
src/components/PlanningSchedule.jsx + css  the schedule zone: empty day columns (Day 1..N) preview
src/pages/Planning.jsx + css               two-pane page: header + single Add; pending | schedule; modal state
src/App.jsx (modify)                       /planning route → <Planning/> (replace ComingSoon)
```

Reuses from #0–#2b: `Modal`, `callerMember`/`canWrite` (`lib/tripAccess`), `initials`
(`lib/display`), the transport method config (`lib/transport`), the RLS helpers, design tokens.
Each unit is single-purpose: config is data-only; `planItems.js` holds all pure logic; the card
only flips/displays; the modal only collects+routes; the backlog only groups/filters; the page wires.

---

## 9. Testing (Vitest + React Testing Library; RLS via SQL checks in the plan)

- **`placeCategories` / `suggestionTypes`** — config completeness (every category has label+color;
  every type maps to a valid target/kind).
- **`lib/planItems.js`** — `availabilityMatches` (weekday ∈ days; time within open/close; date
  within optional window; stays/transport always pass), `availabilityLabel`, and the
  blank/rowToForm/formToRow mappers.
- **Hooks** — `useUpsertPlanItem` (insert vs update by presence of `id`), `useDeletePlanItem`,
  extended `useUpsertTransport` (category/direction passthrough), `useTrip` select includes
  `plan_items` (mocked supabase; invalidations).
- **`SuggestionEditorModal`** — type switch reveals the correct fields; per-type required-field
  validation blocks save; valid save routes to the right table with mapped params.
- **`SuggestionCard`** — front/back content; flip toggling (via a flip/`expanded` prop for
  determinism); editor ✎/✕ gated by `canEdit` + `stopPropagation`.
- **`PlanningBacklog`** — groups by kind; filter date clamped to the trip window; filtering dims
  non-matching places; + Add gated by `canEdit`.
- **`Planning`** — renders backlog from context; viewer read-only.
- **RLS** — SQL checks in the plan: a member reads plan_items; a non-member is denied; a viewer
  cannot insert/update/delete.

---

## 10. Out of scope (restated)

Trip-schedule date/time assignment, day containers, drag & drop, calendar/board/thread views →
**#3b / #3c**. Packing, Finance, Discussion → #4–#6. #3a delivers the suggestion backlog and its
full data model only.
