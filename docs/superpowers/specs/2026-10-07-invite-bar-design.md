# TripPlan — Invite Bar (pending invites under the header) — Design

**Date:** 2026-10-07
**Status:** Approved (design)
**Builds on:** Invitations & Notifications (#2b) — `docs/superpowers/specs/2026-07-01-invitations-notifications-design.md`
**Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, CSS Modules, Vitest + RTL

---

## 1. Context & scope

Invites were answered from the bell dropdown, where every `invite_received` notification kept its
**Accept / Decline** buttons forever — including invites already accepted, declined, or revoked.
Clicking one of those gave "This invite is no longer available." A notification records that an
invite *happened*; it can't say whether the invite is *still pending*.

**Changes**

- Pending invites move to a **message bar directly under the app header**, on every in-app page.
- The bar has **no dismiss**: an invite stays up until it is accepted or declined. The header and
  the bar are sticky together, so a pending invite stays in view while scrolling.
- With **several** invites the bar shows the newest one; an expander at the foot of the bar
  (**⌄ Show all (N)** / **⌃ Show less**) slides the rest open under it, each row with its own
  Accept / Decline.
- The bell dropdown becomes **informational only** — invite notifications still appear there as
  history, without Accept / Decline.

**Out of scope:** realtime push (the bar refetches on focus + every 60 s, like the bell), new
notification types, any change to `respond_invite` or the `notifications` table.

---

## 2. Backend — the invitee's read path

`trip_members` and `trips` are readable only by **accepted** members (`is_trip_member`), so an
invitee can't see their own pending membership or its trip. One `SECURITY DEFINER` read RPC returns
exactly the caller's pending invites; its columns mirror the `invite_received` payload, so the
existing notification copy (`lib/notifications.js`) renders them.

Supabase Dashboard → SQL Editor → run once:

```sql
-- The caller's pending trip invites, newest first. An invitee can't read a pending
-- trip_members row or its trip (both gated on an accepted membership), so this definer
-- function is their read path. Columns mirror the invite_received notification payload.
create or replace function public.my_pending_invites()
returns table (trip_id uuid, trip_name text, role text, actor_name text)
language sql security definer stable set search_path = public as $$
  select m.trip_id, t.name, m.role,
    coalesce((select p.display_name from trip_members h join profiles p on p.id = h.user_id
              where h.trip_id = m.trip_id and h.role = 'host' limit 1), 'Someone')
  from trip_members m
  join trips t on t.id = m.trip_id
  where m.user_id = auth.uid() and m.invite_status = 'pending'
  order by m.created_at desc;
$$;

grant execute on function public.my_pending_invites() to authenticated;
```

Only the host can invite, so the inviter shown is the trip's host. Verify:

```sql
select proname from pg_proc where proname = 'my_pending_invites';   -- one row
```

Because the RPC and `respond_invite` test the same condition (a `pending` row for `auth.uid()`),
an invite leaves the bar exactly when it can no longer be answered — accepted, declined, revoked,
or answered on another device.

---

## 3. Data flow

```
usePendingInvites()   rpc my_pending_invites  -> ['invites', uid]; refetch on focus + 60 s
useRespondInvite()    rpc respond_invite      -> onSuccess: invalidate ['notifications'], ['trips'], ['trip', id]
                                                 onSettled: invalidate ['invites'] (awaited)
```

`onSettled` returns the invalidation promise, so the mutation stays pending (buttons disabled)
until the list has refetched — an answered invite never shows live buttons, and a stale one
(failure `no pending invite`) simply drops out of the bar.

---

## 4. UI — `InviteBar`

Rendered by `DashboardLayout` inside a sticky wrapper with the header (the header keeps
`z-index: 1` over the bar so the bell dropdown overlaps it).

- **No invites** → renders nothing.
- **Row:** ✉ icon · "**{actor}** invited you to **{trip}** as {role}" · **Accept** · **Decline**
  (accessible names "Accept invite to {trip}" / "Decline invite to {trip}").
- **Several invites:** the newest invite shows; the others sit in a region that slides open and
  shut (`grid-template-rows` 0fr ↔ 1fr transition). It stays mounted for the animation and is
  `inert` + `aria-hidden` while shut. Open, it caps at `min(45vh, 320px)` and scrolls.
- **Expander:** a chevron + **Show all (N)** / **Show less** (`aria-expanded`, `aria-controls`)
  under the last visible invite, lined up with the invite text — it is not part of any invite row,
  so it moves down as the list opens. The chevron flips when open.
- **While responding:** all buttons are disabled.
- **On failure:** the error shows under the row it was for — "This invite is no longer
  available." for `no pending invite`, otherwise "Could not update this invite. Please try again."
- **Narrow screens:** the buttons wrap below the text, indented past the icon.

The bell (`NotificationBell` / `NotificationItem`) drops `useRespondInvite`, the Accept / Decline
buttons and their error line; `lib/notifications.js` drops the now-unused `actionable` flag.

---

## 5. Files

```
src/hooks/usePendingInvites.js (+ test)          new — rpc my_pending_invites
src/hooks/useRespondInvite.js (+ test)           invalidate ['invites'] on settle (awaited)
src/components/InviteBar.jsx + .module.css (+ test)  new — the message bar
src/components/ChevronIcon.jsx                   new — expander chevron
src/components/DashboardLayout.jsx + .module.css (+ test)  sticky header + InviteBar wrapper
src/components/NotificationBell.jsx + .module.css (+ test)  informational only
src/components/NotificationItem.jsx + .module.css (+ test)  no action buttons
src/lib/notifications.js (+ test)                drop `actionable`
```

---

## 6. Testing

- **`usePendingInvites`** — calls `my_pending_invites`; empty list before data / on error.
- **`useRespondInvite`** — invalidates invites + notifications + trips + trip on success; invites
  only on failure; stays pending until the invite refetch resolves.
- **`InviteBar`** — nothing when empty; single invite has no expander; Accept / Decline send the
  trip id; Show all reveals every invite and Show less hides them again; the expander sits after
  the last invite, outside the first row; buttons disabled while pending; errors render under the
  matching invite only (stale vs generic copy).
- **`NotificationBell` / `NotificationItem`** — invites render as text with no buttons.
- **`DashboardLayout`** — renders the invite bar.
