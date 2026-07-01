# TripPlan — Subsystem #2 (Slice 2a): Project Shell + Overview + Journey Transport — Design

**Date:** 2026-06-30
**Status:** Approved (design)
**Builds on:** Foundation (#0) — `docs/superpowers/specs/2026-06-18-foundation-design.md`; Projects & Dashboard (#1) — `docs/superpowers/specs/2026-06-26-projects-dashboard-design.md`
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 1. Context & scope

Foundation (#0) shipped auth/onboarding + the dashboard shell. Projects & Dashboard (#1)
shipped trip creation and the flip-card timeline. Clicking a trip card already navigates
to `/trip/:tripId`, today a placeholder (`TripWorkspace`). This slice makes that route real:
**a user opens a trip into its workspace, sees an Overview, and the host/editor can edit the
trip's info and manage its journey transport.**

Subsystem #2 ("Project Shell + Overview") in the Foundation map bundles the shell, the
Overview, invitations, ghost joiners, and notifications. That is too large for one spec, so
#2 is split. **This is slice 2a.**

**In scope (2a)**

- The in-trip **workspace shell**: a trip sub-header + a tab row for the five sections
  (Overview built; Planning / Packing / Finance / Discussion are "coming soon" stubs).
- The **Overview** page: a boarding-pass trip-identity hero, a **journey transport** section,
  and a **travellers** list.
- **Editing** (host/editor): trip info (name, place, dates) and journey transport legs
  (add / edit / remove), each method-aware.
- A new **`transport` table** + its RLS, and a `trips` UPDATE policy + date CHECK constraint.

**Out of scope → later slices**

- Invitations (invite-by-email + role), ghost joiners, the notifications table + working
  bell → **#2b**. The bell stays decorative; the travellers list shows only the host for now.
- **Local** (place-to-place) transport, places, hostels, `plan_items`, scheduling, drag &
  drop → **#3** (Planning).
- Trip **deletion** / leaving a trip, depart/return *separate from* transport legs.

---

## 2. Canonical data-map amendment

The Foundation map (#0 §2) put all transport inside `plan_items` (one table for
place/transport/hostel, built in #3). Working through the Overview surfaced that transport
serves **two distinct purposes**, so the map is amended:

- **Journey transport** — the start/end of the trip (home country ↔ destination). Standalone,
  not tied to any place. Lives on the **Overview**.
- **Local transport** — moving between tourist spots / restaurants *during* the trip. Tied to
  itinerary stops. Belongs to the **Planning** itinerary.

Both are the **same kind of record**, so they share **one new `transport` table** with a
`category` column (`'journey' | 'local'`) — a single source of truth, no duplication.
Consequently:

- **`transport`** (new, this slice) owns all transport. 2a builds the `journey` category;
  `local` is added in #3.
- **`plan_items`** (#3) now covers **place + hostel** only.
- **`trips`** keeps dates only — **no transport columns** are added.

---

## 3. Data model + RLS

### New table: `transport`

```
transport
  id          uuid pk default gen_random_uuid()
  trip_id     uuid not null -> trips(id) on delete cascade
  category    text not null default 'journey'  check (category in ('journey','local'))
  direction   text          check (direction in ('outbound','return'))  -- journey card tag
  method      text not null check (method in ('flight','train','bus','car','ferry','other'))
  depart_date date                       -- outbound→start_date, return→end_date by default; editable
  depart_time time                       -- optional
  from_text   text not null              -- label varies by method (airport/station/terminal/port)
  to_text     text not null
  reference   text                       -- optional: flight no / operator / train line
  sort_order  int  not null default 0    -- reserved for manual ordering (#3); 2a orders by date/time
  created_by  uuid -> trip_members(id)   -- the member who added it (nullable)
  created_at  timestamptz not null default now()
```

`create index on public.transport (trip_id);`

### RLS

Reuses the Foundation/#1 helpers `is_trip_member(trip_id)` and `trip_role(trip_id)` (both
`SECURITY DEFINER`, so their `trip_members` subquery bypasses RLS — no recursion).

```
transport
  select : is_trip_member(trip_id)                      -- any member sees the legs
  insert : trip_role(trip_id) in ('host','editor')
  update : trip_role(trip_id) in ('host','editor')
  delete : trip_role(trip_id) in ('host','editor')
```

Raw-SQL tables are not auto-granted (the Foundation 403 lesson), so:

```sql
grant select, insert, update, delete on public.transport to authenticated;
```

### `trips` changes (no new columns)

Editing a trip is a plain update guarded by RLS (no chicken-and-egg, unlike create — so no
RPC needed). #1 only added a SELECT policy; 2a adds:

```sql
alter table public.trips add constraint trips_dates_ck check (end_date >= start_date);

create policy "trips_update_member_writer" on public.trips
  for update using  (public.trip_role(id) in ('host','editor'))
            with check (public.trip_role(id) in ('host','editor'));

grant update on public.trips to authenticated;
```

The CHECK makes `end_date >= start_date` a DB invariant for **edits too** (the `create_trip`
RPC already validates it on insert; the server is the trust boundary).

> **Co-member profiles:** still read-own-only (Foundation `profiles_select_own`). 2a has no
> co-members yet — the only `trip_members` row is the host (= the caller), whose own profile
> they may already read. Broadening `profiles` RLS to "members of a shared trip can read each
> other" is **deferred to #2b**, where co-members first exist.

---

## 4. Routing & shell

Option A: keep the global TripPlan top bar; add a **trip sub-header** (accent stripe · ← back
· name · place · dates) and a **pill tab row** beneath it; the active section renders into an
`<Outlet/>`.

```
/trip/:tripId            -> redirect to overview
/trip/:tripId/overview   Overview            [built]
/trip/:tripId/planning   ComingSoon          [stub]
/trip/:tripId/packing    ComingSoon          [stub]
/trip/:tripId/finance    ComingSoon          [stub]
/trip/:tripId/discussion ComingSoon          [stub]
```

`TripWorkspace` is rewritten as the trip-shell layout (sub-header + tabs + `<Outlet/>`). It
fetches the trip for the sub-header; `Overview` reads the **same** react-query key, so the
trip is fetched once and deduped. Tabs are `NavLink`s with active styling. Non-member or
invalid `:tripId` → an access state (§10), not a crash.

---

## 5. Overview page

Single column (option A), top to bottom:

1. **Boarding-pass hero** — accent bar, eyebrow `BOARDING PASS` + mono `trip.code`,
   destination `name`, `place` with a sky dot, `start — end · N nights`, a sunset
   **countdown badge** (`countdownLabel` from `lib/tripDates`), and an **Edit** button
   (host/editor only) that opens `EditTripModal`.
2. **Transport** — the journey transport section (§6).
3. **Travellers** — header "N Travellers" + a list (avatar/initial, name, role tag; host =
   sunset). The component handles N members; in 2a it shows the host. Reuses the visual
   language of the #1 card back.

## 6. Journey transport

**Grouped list.** Two labeled groups — **🌍 Getting there (outbound)** and
**🏠 Getting back (return)** — filtered from `transport` by `direction`, ordered within each
group by `depart_date`, then `depart_time`, then `created_at`. Each group has its own
**+ Add**; an empty group shows an "Add … transport" prompt. Each leg row shows the method
glyph, `from_text → to_text`, and `depart_date · time · reference`, with **✎ / ✕** affordances
(host/editor only).

**Method config — single source of truth** (`lib/transportMethods.js`). One object maps each
method to its label, glyph, and the labels its fields take (the data shape is constant —
`from / to / reference` — only the labels change):

```
flight → From airport / To airport / Flight no.
train  → From station / To station / Train or line
bus    → From terminal / To terminal / Operator
car    → From / To / (no reference)
ferry  → From port / To port / Operator
other  → From / To / Details
```

**Add / edit flow** (`TransportEditorModal`, reuses the `Modal` primitive):

- Opened by a group's **+ Add** with **direction** and **default depart_date** preset
  (outbound → `trip.start_date`, return → `trip.end_date`); both remain editable.
- Fields: **direction** toggle, **method** chips (relabel from/to/reference on change),
  **depart date**, **depart time** (optional), **from** / **to** (required), **reference**
  (optional, hidden when the method has none).
- **Save** upserts a `transport` row (`category='journey'`, `created_by` = caller's
  `trip_members.id`), invalidates `['trip', tripId]`; the leg appears under its group.
- **✎** reopens the modal pre-filled (edit = update). **✕** removes after a confirm.
- Validation: method + from + to required; date order is not relevant per-leg. Failures show
  an inline modal error; the modal stays open with input preserved.

---

## 7. Permissions & validation

- **Caller role** is derived client-side from the loaded members (the `trip_members` row with
  `user_id === auth user id` → its `role`). `host`/`editor` see Edit / + Add / ✎ / ✕;
  `viewer` sees a read-only Overview. The UI mirrors the rules only for UX — **RLS is the real
  boundary** (a tampered client still cannot write).
- **Trip edit:** name + place required (trimmed), `end_date >= start_date` — enforced
  client-side *and* by the DB CHECK.
- **Transport:** method + from + to required; time + reference optional.

---

## 8. Data flow (react-query hooks)

- `useTrip(tripId)` — one trip with members + transport in a single round-trip:
  ```js
  supabase.from('trips').select(
    '*, trip_members(id, user_id, display_name, role, profiles(display_name, avatar_url)), transport(*)'
  ).eq('id', tripId).single()
  ```
  RLS limits the row to members; no row → access state.
- `useUpdateTrip(tripId)` — `update({ name, place, start_date, end_date })`.
- `useUpsertTransport(tripId)` — insert (no `id`) or update (with `id`) a leg.
- `useDeleteTransport(tripId)` — delete by `id`.
- All mutations invalidate `['trip', tripId]`.

---

## 9. Component / file structure

```
src/pages/TripWorkspace.jsx (rewrite)         trip-shell layout: sub-header + tabs + <Outlet/>
src/pages/Overview.jsx + .module.css           hero + transport + travellers
src/pages/ComingSoon.jsx + .module.css         stub for the 4 deferred tabs
src/components/TripSubHeader.jsx + .module.css  accent stripe · back · name/place/dates
src/components/TripTabs.jsx + .module.css       the five NavLink tabs
src/components/TravellerList.jsx + .module.css  member avatar + name + role tag
src/components/TransportSection.jsx + .module.css  grouped getting-there / getting-back + Add
src/components/TransportEditorModal.jsx + .module.css  method-aware add/edit form (reuses Modal)
src/hooks/useTrip.js                            read one trip (members + transport)
src/hooks/useUpdateTrip.js                      mutation: edit trip info
src/hooks/useUpsertTransport.js                 mutation: add/edit a leg
src/hooks/useDeleteTransport.js                 mutation: remove a leg
src/components/EditTripModal.jsx + .module.css  edit name/place/dates (reuses Modal)
src/lib/transportMethods.js                     method → {label, icon, fromLabel, toLabel, refLabel}
```

Reuses from #0/#1: `Modal`, `PlaneIcon`, `tripDates` (`countdownLabel`, `nights`, `tripStatus`),
`useAuth`, `supabase`, design tokens. Each unit is small and single-purpose: the shell only
lays out; the section only groups/lists; the modal only collects + submits; date math stays in
`tripDates`; method labels live only in `transportMethods`.

---

## 10. Error handling & edge cases

- **Loading** → skeleton/placeholder in the workspace; **trip load fails** → inline error +
  retry (mirrors #1's dashboard error), never a blank shell.
- **Non-member / invalid `:tripId`** → "This trip doesn't exist or you don't have access" with
  a back-to-trips link (RLS returns no row).
- **Viewer** → Overview renders read-only; no edit/add affordances.
- **No transport yet** → each group shows an add prompt (e.g. "Add your outbound flight").
- **Save fails** (network/validation) → inline modal error; modal stays open, input preserved.
- **Editing trip dates** does not rewrite existing transport dates (legs keep their stored
  dates).

---

## 11. Testing (Vitest + React Testing Library)

- **Hooks** — `useTrip` (embedded select shape, disabled with no id), `useUpdateTrip`,
  `useUpsertTransport` (insert vs update by presence of `id`), `useDeleteTransport`
  (mocked supabase; invalidation).
- **`transportMethods`** — config completeness (every method has labels; `car` has no ref).
- **`TransportEditorModal`** — method switch relabels fields; required-field validation blocks
  save; valid save calls the mutation with mapped params; direction/date preset on open.
- **`TransportSection`** — groups legs by direction, orders by date/time, shows add prompts,
  gates ✎/✕/+Add behind `canEdit`.
- **`EditTripModal`** — required + `end >= start` validation; valid submit calls the mutation.
- **`Overview`** — renders hero/transport/travellers; edit affordances only when host/editor.
- **`TripWorkspace`** — loading / error / not-found; renders sub-header + tabs; index redirects
  to overview.
- **`ComingSoon`** — renders the section name.
- **RLS** — SQL checks in the plan (a member reads the legs; a non-member is denied; a viewer
  cannot insert/update/delete), not Vitest.

---

## 12. Out of scope (restated)

Invitations, ghost joiners, the notifications table + working bell, broadened `profiles` RLS →
**#2b**. Local place-to-place transport, places, hostels, `plan_items`, scheduling, drag &
drop → **#3**. Trip deletion / leaving. The four non-Overview tabs render a "coming soon"
placeholder only.
