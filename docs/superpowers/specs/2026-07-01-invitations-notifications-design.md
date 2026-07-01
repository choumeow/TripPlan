# TripPlan — Subsystem #2 (Slice 2b): Invitations, Ghost Joiners & Notifications — Design

**Date:** 2026-07-01
**Status:** Approved (design)
**Builds on:** Foundation (#0) — `docs/superpowers/specs/2026-06-18-foundation-design.md`; Projects & Dashboard (#1) — `docs/superpowers/specs/2026-06-26-projects-dashboard-design.md`; Project Shell + Overview (#2a) — `docs/superpowers/specs/2026-06-30-project-shell-overview-design.md`
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 1. Context & scope

Slice 2a shipped the trip workspace shell, the Overview (boarding-pass hero + journey
transport + a travellers list showing only the host), and host/editor editing. The bell in
the app top bar is still **decorative**, `profiles` RLS is still **read-own-only**, and every
trip has exactly one member — the host. This slice adds the **social layer**: a trip host can
bring other people in, and users are told about it.

**In scope (2b)**

- **Invite a contributor by email** (existing TripPlan users only), host-only, with a chosen
  role (`editor` | `viewer`) → creates a **pending** membership + notifies the invitee.
- **Accept / decline** an invite from the notification bell.
- **Add a ghost joiner** by name (host-only) — no account, instantly active.
- **Revoke** a pending invite and **remove** an accepted member or ghost (host-only).
- A new **`notifications`** table + a working **bell dropdown** inbox, with three types:
  `invite_received`, `invite_accepted`, `invite_declined`.
- **Broaden `profiles` RLS** so members of a shared trip can read each other's profile.

**Out of scope → later slices**

- Inviting people who **don't have an account yet** (dangling email invites, email-sending
  infra). Invites resolve against existing `profiles` only.
- **Role changes** on an existing member, **leaving** a trip, **transferring host**, deleting a
  trip. (Host cannot remove their own membership here.)
- Removal **notifications** ("you were removed") — not one of the three chosen types.
- Realtime push — the bell refetches on focus + a light interval (§4). Supabase realtime is a
  clean drop-in later.
- Local place-to-place transport, `plan_items`, planning, packing, finance, discussion → #3+.

---

## 2. Decisions locked during brainstorming

1. **Invite target:** existing users only. No dangling/pending-signup invites.
2. **Who can manage membership:** host only. Editors can edit trip content but not bring people in.
3. **Notification types:** all three — invite received (actionable), accepted, declined.
4. **Bell inbox UI:** a dropdown panel anchored under the bell, with inline Accept/Decline.
5. **Membership entry point:** the existing Travellers section on the Overview page.
6. **Removal:** included — revoke pending + remove accepted member/ghost (host cannot remove self).

---

## 3. Architecture — how membership + notification writes happen

Every action here is **two coupled writes**: a membership change *plus* a notification whose
`recipient` is **not** the caller (the invitee, or the host). That coupling drives the design:
all mutations go through **`SECURITY DEFINER` RPCs** (the established `create_trip` pattern),
each performing its membership write **and** authoring the notification **atomically**, as the
function owner.

Consequences:

- Clients never insert/update/delete `trip_members` or `notifications` directly — those tables
  stay **SELECT-only** for the `authenticated` role. A client cannot forge a notification to an
  arbitrary recipient, and there are no half-written states.
- Permission checks (host-only, invitee-only) live in one auditable place per RPC.
- Reads stay as plain RLS-guarded react-query selects.

Rejected alternatives: raw client writes + a DB trigger that generates notifications (logic
hidden in triggers, clumsy to assemble actor/trip labels, more policy surface); raw client
writes + client-side notification inserts (spam/abuse hole, non-atomic).

---

## 4. Data model + RLS

### New table: `notifications`

```
notifications
  id         uuid pk default gen_random_uuid()
  recipient  uuid not null -> profiles(id) on delete cascade
  type       text not null check (type in ('invite_received','invite_accepted','invite_declined'))
  payload    jsonb not null default '{}'   -- {trip_id, trip_name, trip_code, actor_name, role}
  read_at    timestamptz
  created_at timestamptz not null default now()
```

```sql
create index on public.notifications (recipient, created_at desc);
grant select on public.notifications to authenticated;   -- writes only via RPCs
```

`payload` is **denormalized on purpose** (`trip_name`, `trip_code`, `actor_name`, `role` copied
in at creation): a notification still renders correctly even if its trip or the actor changes
or is later deleted.

### RLS

```
notifications  select : recipient = auth.uid()          -- no client insert/update/delete
trip_members   select : is_trip_member(trip_id)         -- unchanged from #1; writes via RPC
```

### `profiles` broadening (co-members read each other)

A `SECURITY DEFINER` helper mirrors the `is_trip_member` pattern (its `trip_members` subquery
bypasses RLS, so no recursive-policy problem):

```sql
create function public.shares_accepted_trip(p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trip_members me
    join trip_members them on them.trip_id = me.trip_id
    where me.user_id = auth.uid() and me.invite_status = 'accepted'
      and them.user_id = p_user
  );
$$;

create policy "profiles_select_comembers" on public.profiles
  for select using (public.shares_accepted_trip(id));
```

The **caller** must be an `accepted` member; the **target** may be any status — so the host can
render a *pending* invitee's name/avatar in the Travellers list. The invitee does not need this
policy to render *their* invite: the host's name travels in the notification `payload`. This is
additive to Foundation's `profiles_select_own` (own row still readable).

### `transport` FK fix

`transport.created_by -> trip_members(id)` becomes **`on delete set null`**, so removing a member
leaves their transport legs intact (`created_by` goes null; the UI already treats it as nullable).

```sql
alter table public.transport drop constraint if exists transport_created_by_fkey;
alter table public.transport add constraint transport_created_by_fkey
  foreign key (created_by) references public.trip_members(id) on delete set null;
```

### RPCs (`SECURITY DEFINER set search_path = public`, `grant execute … to authenticated`)

All raise on `auth.uid() is null`.

- **`invite_member(p_trip_id uuid, p_email text, p_role text) returns trip_members`**
  - Guard: `trip_role(p_trip_id) = 'host'`; `p_role in ('editor','viewer')`.
  - Resolve `profiles` by `lower(email)`; not found → raise (`no user found`).
  - Block self-invite and duplicates (a matching `trip_members` row already exists; also backed
    by `unique(trip_id, user_id)`).
  - Insert `trip_members(trip_id, user_id, role=p_role, invite_status='pending')`.
  - Insert `notifications(recipient=invitee, type='invite_received', payload={trip_id, trip_name,
    trip_code, actor_name=host display_name, role})`. Return the membership row.

- **`respond_invite(p_trip_id uuid, p_accept boolean) returns void`**
  - Find the caller's `pending` membership for the trip; none → raise (`no pending invite`).
  - Accept → set `invite_status='accepted'`. Decline → delete the membership row.
  - Notify the host (`invite_accepted` / `invite_declined`, `actor_name` = responder).
  - Mark the original `invite_received` notification (this recipient + trip) read.

- **`add_ghost(p_trip_id uuid, p_name text) returns trip_members`**
  - Guard host; `p_name` trimmed non-empty.
  - Insert `trip_members(trip_id, user_id=null, display_name=p_name, role='viewer',
    invite_status='accepted')`. No notification (no recipient).

- **`remove_member(p_member_id uuid) returns void`**
  - Load the membership + its `trip_id`; guard caller is host of that trip.
  - Refuse if the target row is the **host** (`role='host'`) → raise.
  - Delete the row. Covers revoke-pending, remove-accepted, and remove-ghost (all "delete this
    membership row"). No notification.

- **`mark_notifications_read(p_ids uuid[] default null) returns void`**
  - `update notifications set read_at = now() where recipient = auth.uid() and read_at is null
    and (p_ids is null or id = any(p_ids))`.

```sql
grant execute on function public.invite_member, public.respond_invite, public.add_ghost,
  public.remove_member, public.mark_notifications_read to authenticated;
```

---

## 5. Data flow (react-query hooks)

```
useNotifications()          read notifications for auth.uid(), newest first; derives unreadCount
useMarkNotificationsRead()  rpc mark_notifications_read
useInviteMember(tripId)     rpc invite_member       -> invalidate ['trip', tripId]
useRespondInvite()          rpc respond_invite       -> invalidate ['notifications'], ['trips'], ['trip', tripId]
useAddGhost(tripId)         rpc add_ghost            -> invalidate ['trip', tripId]
useRemoveMember(tripId)     rpc remove_member        -> invalidate ['trip', tripId]
```

- On **accept**, invalidating `['trips']` makes the newly-joined trip appear on the invitee's
  dashboard; invalidating `['trip', tripId]` refreshes the Travellers list.
- **Freshness:** a notification is created by *another* user's action, so `useNotifications` uses
  `refetchOnWindowFocus` + a modest `refetchInterval` (~60s) to surface new invites without extra
  infra. Realtime is a future drop-in, not built now.

---

## 6. UI

### Notification bell (`NotificationBell`)

Replaces the decorative button in `DashboardLayout` (`src/components/DashboardLayout.jsx`):

- Bell + an **unread-count badge** (from `useNotifications().unreadCount`).
- Click → a **dropdown panel** anchored under the bell (closes on outside-click / `Esc`;
  `aria-expanded`, focus handled). Opening calls `mark_notifications_read` to clear the badge.
- Each row renders via `NotificationItem`, driven by a `lib/notifications.js` config
  (type → icon + text template — single source of truth):
  - `invite_received` → "**{actor}** invited you to **{trip}** as {role}" + **[Accept] [Decline]**
    (call `useRespondInvite`). Actions remain available regardless of read state.
  - `invite_accepted` / `invite_declined` → "**{actor}** accepted/declined your invite to **{trip}**".
- Empty state: "No notifications yet."

### Travellers section on Overview (host-only additions)

Extends the existing `TravellerList` + wires entry points into `Overview`:

- One **`AddTravellerModal`** (reuses the `Modal` primitive) with a segmented toggle:
  - **Invite by email** → email + role (editor/viewer) → `useInviteMember`.
  - **Add ghost** → name only → `useAddGhost`.
  - One modal, two modes — DRY vs. two near-identical dialogs.
- Header buttons (**+ Invite**, **+ Add joiner**) render only when the caller is host.
- Each traveller row gains: a muted **"pending"** tag for un-accepted contributors, and a
  host-only **✕ remove** affordance (confirm before removing) — **except the host's own row**,
  which has no remove. Gated by a `canManage` prop (caller is host).

The caller's role is derived client-side from the loaded members (the `trip_members` row whose
`user_id === auth user id`), exactly as in 2a.

---

## 7. Permissions & validation

- **Client mirrors, RLS/RPC enforce.** Invite / add-ghost / remove affordances render for host
  only; a tampered client still cannot write (each RPC re-checks host).
- **Invite:** email required + basic format check (client); role ∈ editor/viewer; server resolves
  the user, blocks self-invite and duplicates.
- **Add ghost:** name required (trimmed non-empty).
- **Respond:** only the pending invitee (`auth.uid()`) can accept/decline — enforced in the RPC.
- **Remove:** host only; the host's own row cannot be removed.

---

## 8. Error handling & edge cases

- **Email not a registered user** → RPC raises → inline modal error: "No TripPlan user with that
  email."
- **Already a member / already invited** → friendly error (backed by `unique(trip_id, user_id)`).
- **Accept an invite whose trip was deleted** → no pending row → "This invite is no longer
  available"; refetch clears it. Denormalized payload means the item still rendered fine before.
- **Decline** deletes the membership row (re-invite is possible later).
- **Remove a member who created transport** → FK `set null`; legs remain.
- **Removing the host** → blocked server-side.
- **Co-member profile reads** now permitted via `shares_accepted_trip`; a non-shared user stays
  denied.
- **Load / mutation failures** → inline errors with preserved input (mirrors #1 / #2a); never a
  blank surface.

---

## 9. Component / file structure

```
src/components/NotificationBell.jsx + .module.css   bell + unread badge + dropdown panel
src/components/NotificationItem.jsx                 render one notification by type (+ accept/decline)
src/components/AddTravellerModal.jsx + .module.css  invite-by-email / add-ghost (mode toggle); reuses Modal
src/lib/notifications.js                            type -> {icon, text template}  (single source of truth)
src/hooks/useNotifications.js                       read + unreadCount
src/hooks/useMarkNotificationsRead.js               rpc mark_notifications_read
src/hooks/useInviteMember.js                        rpc invite_member
src/hooks/useRespondInvite.js                       rpc respond_invite
src/hooks/useAddGhost.js                            rpc add_ghost
src/hooks/useRemoveMember.js                        rpc remove_member
src/components/TravellerList.jsx (extend)           pending tag + host-only remove; canManage prop
src/components/DashboardLayout.jsx (edit)           swap decorative bell -> <NotificationBell/>
src/pages/Overview.jsx (edit)                       wire host-only + Invite / + Add joiner
```

**SQL (documented in the plan, applied to Supabase):** create `notifications` + index + grant ·
`shares_accepted_trip()` + `profiles_select_comembers` policy · `transport.created_by` →
`on delete set null` · the five RPCs + execute grants.

Reuses from #0/#1/#2a: `Modal`, `useAuth`, `supabase`, `useTrip`, `TravellerList`, design tokens.
Each unit stays small and single-purpose: the bell only lists/marks; the item only renders one
notification; the modal only collects + submits; notification copy lives only in
`lib/notifications.js`; membership logic lives only in the RPCs.

---

## 10. Testing (Vitest + React Testing Library; RLS via SQL checks in the plan)

- **`lib/notifications.js`** — config completeness (every type has icon + template).
- **`NotificationBell`** — unread badge count; opens the panel; marks read on open; empty state.
- **`NotificationItem`** — each type renders; `invite_received` Accept/Decline call `useRespondInvite`.
- **`AddTravellerModal`** — invite-mode email + role validation; ghost-mode name validation; toggle
  switches fields; valid submit calls the right mutation with mapped params.
- **`TravellerList`** — pending tag; remove gated by `canManage`; the host row has no remove.
- **Hooks** — each RPC called with mapped params + correct invalidations (mocked supabase).
- **`Overview`** — invite/add affordances only when the caller is host.
- **RLS / RPC** — SQL checks in the plan: a non-host cannot invite/remove; only the invitee can
  respond; a co-member profile read is allowed while a stranger is denied; removing the host is
  blocked.

---

## 11. Out of scope (restated)

Non-account email invites + email-sending infra; role changes; leaving a trip; transferring host;
trip deletion; removal notifications; realtime push. Local place-to-place transport, `plan_items`,
planning, packing, finance, discussion — all in #3 and later.
