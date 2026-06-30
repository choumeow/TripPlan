# TripPlan — Subsystem #1: Projects & Dashboard — Design

**Date:** 2026-06-26
**Status:** Approved (design)
**Builds on:** Foundation (#0) — `docs/superpowers/specs/2026-06-18-foundation-design.md`
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 1. Context & scope

Foundation (#0) shipped auth, profiles, onboarding, and the `DashboardLayout` shell
with an empty "Your trips" state. This subsystem makes that real: **a user can create
a trip and see their trips on a timeline.**

**In scope**

- Create a trip via a boarding-pass-styled **modal** (name, place, start date, end date).
- The `trips` and `trip_members` tables + the `is_trip_member` / `trip_role` RLS
  helpers (deferred from Foundation), with RLS policies.
- A **timeline dashboard**: a centered carousel rail — previous ← nearest upcoming → future.
- A **flip trip card** (boarding-pass front; same-size scrollable back with a journey
  bar + live contributor list + scroll-progress indicator).

**Out of scope (later subsystems)**

- Notification bell + invitations + ghost joiners → **#2** (the `notifications` table is
  created there, alongside its only producer).
- Opening a trip into its workspace (top-nav Overview/Planning/…) → **#2**. In #1 the
  card flips on tap; there is no "open trip" navigation yet.
- Depart/return **times**, transport slots → **#2** (Overview). #1 stores dates only.

---

## 2. Data model

Two tables are created here (designed in the Foundation data map), plus two RLS helpers.

```
trips
  id            uuid pk default gen_random_uuid()
  name          text not null
  place         text not null
  start_date    date not null
  end_date      date not null                 -- must be >= start_date
  accent_color  text not null                 -- auto-assigned from a fixed palette
  code          text not null                 -- short boarding-pass code, e.g. 'TRIP·07'
  created_by    uuid not null -> profiles.id
  created_at    timestamptz not null default now()

trip_members  ★ join hub (referenced by all later subsystems)
  id            uuid pk default gen_random_uuid()
  trip_id       uuid not null -> trips.id on delete cascade
  user_id       uuid -> profiles.id           -- NULL = ghost joiner (added in #2)
  display_name  text                          -- ghost name / cached label
  role          text not null                 -- 'host' | 'editor' | 'viewer'
  invite_status text not null default 'accepted' -- 'pending' | 'accepted' (pending used in #2)
  created_at    timestamptz not null default now()
  unique (trip_id, user_id)                   -- a user joins a trip once
```

In #1 the only `trip_members` row per trip is the **host** (`role='host'`,
`invite_status='accepted'`, `user_id` = creator). Editors/viewers/ghosts arrive in #2.

### RLS helpers (created now, since `trip_members` now exists)

```sql
create function public.is_trip_member(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and invite_status = 'accepted'
  );
$$;

create function public.trip_role(p_trip_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select role from trip_members
  where trip_id = p_trip_id and user_id = auth.uid() and invite_status = 'accepted'
  limit 1;
$$;
```

### RLS policies (#1 needs reads only; writes go through `create_trip`)

```
trips
  select : is_trip_member(id)            -- you see trips you belong to

trip_members
  select : is_trip_member(trip_id)       -- members see co-members (card back)
```

`is_trip_member` / `trip_role` are `SECURITY DEFINER`, so the `trip_members` subquery
they run bypasses RLS — no recursive-policy problem.

Inserts are never raw client inserts: `create_trip()` (`SECURITY DEFINER`) performs both
inserts as the function owner. Host **edit/delete** of a trip, the **accept-invite**
update, and contributor/ghost inserts arrive *with their UI in #2*, so those policies are
deferred there (don't ship untested, unused policies now).

Grant (raw-SQL tables aren't auto-granted — Foundation 403 lesson):

```sql
grant select on public.trips, public.trip_members to authenticated;
```

> **Co-member profiles:** in #1 each trip has exactly one member — the host/creator — so
> the card back lists one traveller (the component already handles N). Reading *other*
> members' profile names needs `profiles` RLS broadened to "members of a shared trip can
> read each other," which is **deferred to #2**, where co-members first exist. The #1
> dashboard query only ever embeds the caller's own `profiles` row, which Foundation's
> `profiles_select_own` already permits.

### `create_trip` RPC (atomic creation)

Creating a trip is two inserts (trip + host membership). A single `security definer`
function does both atomically and assigns `accent_color` + `code`, avoiding a partial
state and insert-policy chicken-and-egg:

```sql
create function public.create_trip(
  p_name text, p_place text, p_start date, p_end date
) returns trips language plpgsql security definer set search_path = public as $$
declare v_trip trips;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_end < p_start then raise exception 'end_date before start_date'; end if;

  insert into trips (name, place, start_date, end_date, accent_color, code, created_by)
  values (
    p_name, p_place, p_start, p_end,
    -- accent: deterministic pick from a fixed palette
    (array['#0EA5E9','#22C55E','#F59E0B','#A855F7','#EC4899','#14B8A6'])[
      1 + (floor(random()*6))::int ],
    'TRIP·' || lpad(((floor(random()*99))::int + 1)::text, 2, '0'),
    auth.uid()
  )
  returning * into v_trip;

  insert into trip_members (trip_id, user_id, display_name, role, invite_status)
  values (v_trip.id, auth.uid(), null, 'host', 'accepted');

  return v_trip;
end;
$$;
```

(`display_name` for the host is read from the joined `profiles` row at query time, so it
stays in sync if the user renames; it is not duplicated onto the membership row.)

---

## 3. Data flow

- **Dashboard read** — one query fetches the user's trips and each trip's members in a
  single round-trip via Supabase embedded selects (no N+1):
  ```js
  supabase
    .from('trips')
    .select('*, trip_members(id, user_id, display_name, role, profiles(display_name, avatar_url))')
  ```
  RLS limits rows to trips the caller belongs to. Wrapped in a `useTrips()` react-query hook.
- **Create** — `useCreateTrip()` mutation calls `supabase.rpc('create_trip', {...})`, then
  invalidates `['trips']` so the new card appears.
- **Timeline arrangement** is computed on the client from the fetched trips + today's date
  (pure functions in `lib/tripDates.js`), not stored.

---

## 4. Timeline dashboard

`Dashboard.jsx` renders:

- **Empty state** (no trips) — the existing "No trips yet — plan your first journey"
  card, with the **+ New trip** button opening the create modal.
- **Timeline** (≥1 trip) — `TripTimeline` lays out a centered carousel rail:
  - **Hero (center, largest):** the *nearest upcoming or in-progress* trip — the trip with
    the smallest `start_date` among those whose `end_date >= today`. If a trip is currently
    in progress (`start_date <= today <= end_date`), it is the hero.
  - **Previous (left):** trips with `end_date < today`, most-recent first.
  - **Future (right):** the remaining not-yet-started trips after the hero, soonest first.
  - Horizontally scrollable; the hero is scrolled to center on load. The **+ New trip**
    button sits in the page header (top-right of the content area).

### Date logic (`lib/tripDates.js`, pure + unit-tested)

```
tripStatus(trip, today)      -> 'past' | 'current' | 'upcoming'
daysToGo(trip, today)        -> integer (start - today; negative once started)
nights(trip)                 -> end - start (whole days)
countdownLabel(trip, today)  -> 'X days to go' | 'In progress · Day k' | 'Completed'
journeyProgress(trip, today) -> 0..1  (plane position; ramps over the 30 days before
                                start, clamped; 1.0 once started)
arrangeTimeline(trips, today)-> { previous: [...], hero: trip|null, future: [...] }
```

---

## 5. The trip card (`TripCard`)

A fixed-size (240 × 330) flip card; `flipped` is local component state, toggled on
click/tap (keyboard: Enter/Space; `role="button"`, `aria-pressed`). Respects
`prefers-reduced-motion` (cross-fade instead of 3D flip).

**Front** — mini boarding pass:
- Accent color bar (`trip.accent_color`); eyebrow `BOARDING PASS` + mono `trip.code`.
- Destination `trip.name`; place `trip.place` with a sky dot.
- Dates `start — end · N nights`; dashed perforation.
- Sunset **countdown badge** (`countdownLabel`); "tap to flip" hint.

**Back** — same size, scrolls:
- Header **"N Travellers"** (count of `trip_members`).
- **Journey bar** — a route line with a plane at `journeyProgress`, label = days/`countdownLabel`.
- **Scrollable contributor list** — each member: avatar/initial, name (`profiles.display_name`
  or ghost `display_name`), role tag (host = sunset; editor/viewer = slate). The list
  scrolls inside the fixed card; a **scroll-progress indicator** (thin sky track, right
  edge) reflects scroll position. List is live (reflects current `trip_members`).
- "tap to flip back" hint.

The hero card renders larger than rail cards via a size variant prop; both share one
component.

---

## 6. Create-trip modal (`CreateTripModal`)

- An accessible dialog (focus-trap, `Esc` closes, backdrop click closes, `aria-modal`,
  labelled), styled as a **blank boarding pass** being filled in.
- Fields: **name** (required), **place** (required), **start date** (required), **end
  date** (required). Client validation: all required; `end_date >= start_date`.
- Submit → `useCreateTrip()` → on success close + the new card animates onto the timeline;
  on error, an inline error message (no silent failure). Submit disabled while pending.
- A small reusable `Modal` primitive (overlay + dialog + a11y wiring) is introduced and
  used here; later subsystems reuse it.

---

## 7. Component / file structure

```
src/lib/tripDates.js                 pure date/arrangement helpers (unit-tested)
src/hooks/useTrips.js                 react-query read (trips + members)
src/hooks/useCreateTrip.js            react-query mutation (create_trip RPC)
src/components/Modal.jsx + .module.css         accessible dialog primitive
src/components/CreateTripModal.jsx + .module.css
src/components/TripTimeline.jsx + .module.css   carousel rail arrangement
src/components/TripCard.jsx + .module.css       flip card (front/back)
src/components/JourneyBar.jsx + .module.css     route line + plane progress
src/pages/Dashboard.jsx (rewrite)     empty state vs timeline; owns modal open state
```

Each unit is small and single-purpose: date math is pure and isolated from rendering;
the card knows nothing about fetching; the timeline only arranges; the modal only
collects + submits.

---

## 8. Error handling & edge cases

- **No trips** → empty state (not an error).
- **Trips load fails** → an inline error with a retry (mirrors the `RequireOnboarded`
  pattern); never a blank dashboard.
- **Create fails** (network/validation) → inline modal error; modal stays open with input
  preserved.
- **`end_date < start_date`** → blocked client-side *and* in `create_trip` (server is the
  trust boundary).
- **Single trip** → it's the hero; empty left/right rails.
- **In-progress trip** → hero with "In progress · Day k".
- **Long contributor list** → scrolls inside the card (the scroll-progress indicator).

---

## 9. Testing

- **`lib/tripDates.js`** — thorough unit tests (status boundaries at today, nights,
  countdown labels, journey progress clamps, `arrangeTimeline` hero selection with
  past/current/future mixes). Pure functions → TDD.
- **`TripCard`** — renders front fields; flips on click/keyboard; back shows travellers
  count + roles.
- **`CreateTripModal`** — required-field + date-order validation blocks submit; valid
  submit calls the mutation; Esc/backdrop close.
- **`TripTimeline`** — arranges previous/hero/future correctly from a fixture.
- **`Dashboard`** — empty state with no trips; timeline when trips exist; error state.
- **Hooks** — `useTrips` (embedded select shape), `useCreateTrip` (rpc called, invalidates).
- **RLS** — verified by SQL checks in the plan (a member sees only their trips; a
  non-member cannot read another's trip), not Vitest.

---

## 10. Out of scope (restated)

Bell, invitations, ghost joiners, opening the trip workspace, Overview, depart/return
times and transport — all in subsystem #2. The `notifications` table is created in #2.
