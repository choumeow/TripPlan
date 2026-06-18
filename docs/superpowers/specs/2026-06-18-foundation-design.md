# TripPlan — Subsystem #0: Foundation (Auth & Identity) — Design

**Date:** 2026-06-18
**Status:** Approved (design)
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 0. Context

TripPlan is a collaborative travel-planning platform. It is decomposed into seven
subsystems, built in order because later ones depend on the data model and
permission rules established here:

| # | Subsystem | Summary |
|---|-----------|---------|
| 0 | **Foundation: Auth & Identity** *(this doc)* | Google login, name onboarding, profiles, permission model, RLS strategy, canonical data map |
| 1 | Projects & Dashboard | Create project, timeline dashboard, flip cards, bell notifications, invitations |
| 2 | Project Shell + Overview | Top nav, trip info, transport slots, joiner list, invite-with-permission |
| 3 | Planning | Pending/planning areas, small cards, calendar/board/thread modes, transport & hostel cards, drag & drop |
| 4 | Packing | Per-joiner blocks, assignment flow, private items |
| 5 | Finance | Budget / Team / Individual tabs, split-balancing, receipts |
| 6 | Discussion | Chat (30-day expiry), polls (72h auto-conclude), conclusions |

Data is linked across subsystems, so the **full data model is mapped now** (Section 2)
even though most tables are built in their own subsystem.

---

## 1. Scope of Foundation (#0)

A thin but complete vertical slice. **After this subsystem ships, a user can:
sign in with Google → confirm their name → land on an authenticated (empty)
dashboard shell.**

Built now:

1. Supabase Google OAuth.
2. `profiles` table + a DB trigger that auto-creates a profile row on first sign-in.
3. The "Welcome to TripPlan, what's your name?" onboarding screen.
4. App shell: routing, protected routes, an auth/session context, the react-query
   provider, and the Login + Onboarding screens.
5. RLS helper functions (`is_trip_member`, `trip_role`) + this canonical data map,
   committed as the reference every later subsystem builds against.

**Not** built here: trips, planning, packing, finance, discussion. Their schema is
*designed* below so nothing collides later, but the tables and pages are created in
their own subsystems.

---

## 2. Canonical Data Model (the backbone)

Only `profiles` is created in #0. Each other table notes the subsystem that builds it.
`★` marks the universal join hub.

```
profiles (#0)                    -- one row per Google user
  id            uuid PK  (= auth.users.id)
  email         text
  display_name  text
  avatar_url    text
  onboarded     boolean default false
  created_at    timestamptz

trips (#1)                       -- a travel project
  id, name, place,
  depart_date, return_date, depart_time, return_time,
  outbound_transport_time?, return_transport_time?,   -- Overview's 2 transport slots
  created_by -> profiles.id,
  created_at

trip_members (#1)  ★ THE JOIN HUB
  id            uuid PK
  trip_id       -> trips.id
  user_id       -> profiles.id   (NULL = ghost joiner, no account)
  display_name  text             -- ghost name, or cached display name
  role          enum host|editor|viewer
  invite_status enum pending|accepted   -- only meaningful when user_id is set
  created_at

notifications (#1)               -- the bell/inbox
  id, recipient -> profiles.id, type, payload jsonb, read_at, created_at

plan_items (#3)                  -- ONE table for place / transport / hostel cards
  id, trip_id,
  kind        enum place|transport|hostel,
  status      enum pending|planned,
  details     jsonb            -- kind-specific fields
  -- schedule (drives calendar/board/thread, shared by all kinds):
  date?, start_time?, duration?, sort_order,
  created_by -> trip_members.id

packing_items (#4)
  id, trip_id,
  owner_member_id -> trip_members.id,   -- whose block
  text, checked, is_private,
  assigned_by  -> trip_members.id,
  assign_status enum pending|added|rejected

budget_categories (#5)           -- defaults: hostel, meal, transport, ticket, photograph
  id, trip_id, name, budget_amount

expenses (#5)                    -- team + individual share this table
  id, trip_id,
  category_id -> budget_categories.id,
  scope       enum team|individual,
  description, total_amount,
  paid_by -> trip_members.id, receipt_url, created_by, created_at

expense_splits (#5)              -- who owes what; SUM(amount) MUST equal total_amount
  id, expense_id -> expenses.id, member_id -> trip_members.id, amount

messages (#6)     id, trip_id, member_id -> trip_members, body, created_at   -- 30-day expiry
polls (#6)        id, trip_id, question, options jsonb, closes_at (=created+72h), concluded, result
poll_votes (#6)   id, poll_id -> polls, member_id -> trip_members, option
conclusions (#6)  id, trip_id, body, author -> trip_members, created_at
```

### Key design choices that keep linked data clean

1. **`trip_members.id` is the universal "person in this trip" reference.** Packing
   owner, expense payer, split member, message author, poll voter — all point to it.
   It works identically whether the person has an account (`user_id` set) or is a
   ghost (`user_id` NULL). This is what lets a ghost joiner appear in packing/finance
   with zero special-casing. When a ghost later signs up and is invited, set their
   `user_id` and all history carries over.

2. **`plan_items` is one table for all three card kinds** (`place`/`transport`/`hostel`)
   with a `kind` flag + a `details` jsonb. All three are dragged into the same
   day-containers, so sharing the schedule fields means calendar / board / thread
   are three renderings of *one* dataset — no duplication across modes.

3. **`expenses` carries a `scope` flag** so team and individual finance share one
   table; RLS hides `scope = 'individual'` rows from everyone but the owner.

---

## 3. Participants: contributors vs ghost joiners

Same `trip_members` table, but **two separate UI creation flows** (built in #2):

- **Invite contributor** — by email; host picks `editor` or `viewer`. Creates a
  `trip_members` row with `user_id` set + `invite_status = pending`, and sends a
  notification. The invitee must accept (`invite_status = accepted`).
- **Add joiner (ghost)** — by name only; no email, no invite. Creates a
  `trip_members` row with `user_id = NULL`, instantly active.

Downstream subsystems never distinguish the two — they only see `trip_members.id`.

---

## 4. Permission & RLS strategy (the security spine)

All access is enforced **in the database** via Row-Level Security, not just the UI
(client checks are bypassable). The UI mirrors the rules only for UX.

- Three roles per trip, stored on `trip_members.role`: `host`, `editor`, `viewer`.
- SQL helper functions (created in #1, alongside `trip_members`, since they read
  from it — a Postgres function can't reference a table that doesn't exist yet; the
  *strategy* below is established now and `profiles` RLS is built in #0):
  - `is_trip_member(trip_id)` — is the caller an accepted member of this trip?
  - `trip_role(trip_id)` — the caller's role for this trip.
- Policy pattern applied to every trip-scoped table (written with each subsystem):
  - **read** = `is_trip_member(trip_id)`
  - **write** = `trip_role(trip_id) IN ('host','editor')`
  - **host-only** (invite, delete trip, edit budget) = `trip_role(trip_id) = 'host'`
- **Privacy carve-outs baked in (not configurable):**
  - `expenses` with `scope = 'individual'` → visible only to the owning member, even host.
  - `packing_items` with `is_private = true` → visible only to the owning member.

`profiles` RLS (built now): a user may read/update only their own row.

---

## 5. Auth & onboarding flow

```
[Login page]  (public)
  "Sign in with Google" -> Supabase OAuth -> redirect back
    -> DB trigger creates profiles row (email + Google name + avatar, onboarded=false)
      -> onboarded == false ?
          yes -> [Onboarding] "Welcome to TripPlan, what's your name?"
                   (pre-filled from Google, editable) -> save, onboarded=true -> Dashboard
          no  -> [Dashboard shell]
```

- `profiles.onboarded` gates the name screen so it shows exactly once.
- Session lives in a React **AuthContext** subscribed to Supabase
  `onAuthStateChange`, so the whole app reacts to login/logout.
- Sign-out clears the session and returns to `/login`.

---

## 6. App shell, routing & folder structure

Routing skeleton (pages filled in by later subsystems):

```
/login                      Login (public)
/onboarding                 name screen (auth, pre-onboard only)
/                           Dashboard (auth)                     [#1]
/trip/:tripId               Project shell w/ top nav             [#2]
    /overview /planning /packing /finance /discussion
```

Protected routes redirect to `/login` when there is no session; the onboarding
guard redirects pre-onboard users to `/onboarding`.

Folder structure:

```
src/
  lib/supabaseClient.js        (exists; will move from src/ root)
  auth/        AuthContext, ProtectedRoute, useAuth
  pages/       Login, Onboarding, Dashboard, ...
  components/  shared UI
  hooks/       react-query data hooks
```

---

## 7. Testing

- **Vitest + React Testing Library** for the auth context and route-guard logic
  (session present/absent, onboarded/not, role gating helpers).
- A **manual smoke test** of the real Google login round-trip — OAuth cannot be
  fully mocked end-to-end.
- Each later subsystem adds its own tests against the RLS policies it introduces.

---

## 8. Out of scope for #0

Trips/dashboard, project shell, planning, packing, finance, discussion — designed
in Section 2, built in their own subsystems. Realtime (Discussion) and the
drag-and-drop library (Planning) are decided inside those subsystems, not here.
