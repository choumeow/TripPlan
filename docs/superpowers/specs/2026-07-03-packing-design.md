# TripPlan — Subsystem #4: Packing — Design

**Date:** 2026-07-03
**Status:** Approved (design)
**Builds on:** Foundation (#0), Projects & Dashboard (#1), Project Shell + Overview (#2a), Invitations & Notifications (#2b), Planning #3a/#3b — see `docs/superpowers/specs/`
**Stack:** React 19 + Vite, Supabase, `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 1. Context & scope

`/trip/:tripId/packing` is currently a `ComingSoon` stub. This slice makes it real: a
collaborative **packing checklist** for the trip, split into a **shared group list** and a
**personal list per traveller**, organised by category and tracked with a packed checkbox.

**The organising model (C):** shared items **and** per-person items.

- **Shared** — group gear (tent, first-aid kit, JR passes). Visible to every member. Each item
  is optionally **assigned** to the traveller who carries it. Host/editors add/rename/assign/
  delete; **anyone** in the trip can tick an item packed.
- **Personal** — one list per traveller:
  - A **real member's** personal items are **visible only to that member** (any role, including
    viewer, fully controls their own list).
  - A **ghost joiner's** personal items are **visible to all contributors** and managed by
    host/editors (a ghost can't log in, so the group packs for them).

**In scope (#4):** a `packing_items` table + RLS (incl. the per-user personal-visibility rule);
two `SECURITY DEFINER` helpers (`member_is_ghost`, `member_user_id`); a `set_packing_packed`
RPC for the "anyone ticks packed" rule; a 6-category config; the `/packing` page (replacing the
stub) as a **sidebar (master-detail)** layout; the add/edit modal; read via an extended
`useTrip`; create/edit/delete + optimistic toggle.

**Out of scope → later:** quantity/note fields, packing templates or "common items" suggestions
(a possible future slice, like #3c is for Planning), reminders/notifications on packing, export.
Finance (#5), Discussion (#6).

**Terminology:** "contributor" in Boss's framing = any trip member who participates. In this
app the roles are **host / editor / viewer**; write permissions on shared/ghost lists are
**host/editor**, and every member (incl. viewer) owns their personal list.

---

## 2. Data model + RLS

### New table: `packing_items` (one table, `scope` discriminator)

Chosen over two tables (shared vs personal) for the same reason `transport` uses one table with
a `category` column: it's one source of truth, one hook set, one RLS surface. Explicit columns
(no `jsonb`) keep it type-safe and easy to unit-test (this project is TDD-heavy).

```
packing_items
  id                 uuid pk default gen_random_uuid()
  trip_id            uuid not null references trips(id) on delete cascade
  scope              text not null check (scope in ('shared','personal'))
  owner_member_id    uuid references trip_members(id) on delete cascade   -- NULL for shared; the person for personal
  category           text not null check (category in
                       ('documents','clothing','toiletries','electronics','gear','other'))
  title              text not null
  assignee_member_id uuid references trip_members(id) on delete set null  -- shared only; NULL = "to decide"
  packed             boolean not null default false
  sort_order         int not null default 0
  created_by         uuid references trip_members(id) on delete set null
  created_at         timestamptz not null default now()
```

FK semantics: `owner_member_id` is **`on delete cascade`** — removing a member (incl. a ghost)
removes their personal items. `assignee_member_id` is **`on delete set null`** — a removed
assignee just leaves the shared item unassigned (mirrors `transport.created_by` from #2a).

```sql
create index on public.packing_items (trip_id);
alter table public.packing_items enable row level security;
grant select, insert, update, delete on public.packing_items to authenticated;
```

### Two `SECURITY DEFINER` helpers (recursion-safe, like `is_trip_member`/`trip_role`)

The personal-visibility rule lives in exactly one place by expressing it through two helpers:

```sql
create or replace function public.member_is_ghost(member_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select user_id is null from trip_members where id = member_id
$$;

create or replace function public.member_user_id(member_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select user_id from trip_members where id = member_id
$$;

grant execute on function public.member_is_ghost(uuid)  to authenticated;
grant execute on function public.member_user_id(uuid)   to authenticated;
```

Both are `SECURITY DEFINER`, so their `trip_members` read bypasses that table's RLS — no
recursion, same pattern as the Foundation `is_trip_member` / `trip_role` helpers this slice
reuses.

### RLS — SELECT (the novel part: per-user row filtering)

Prior slices were all "any trip member reads." Here personal rows are filtered per user:

```sql
create policy "packing_select" on public.packing_items for select using (
  public.is_trip_member(trip_id) AND (
    scope = 'shared'                                         -- all members see shared
    OR public.member_user_id(owner_member_id) = auth.uid()  -- my own personal list
    OR public.member_is_ghost(owner_member_id)              -- any ghost's personal list
  )
);
```

Each user's read set = **all shared + their own personal + every ghost's personal**. Another
real member's personal rows never arrive — so their items *and* their progress counts are
invisible with nothing to leak client-side.

### RLS — writes (full add / edit / delete)

```sql
create policy "packing_insert" on public.packing_items for insert with check (
  public.is_trip_member(trip_id) AND (
       (scope = 'shared'   AND public.trip_role(trip_id) in ('host','editor'))
    OR (scope = 'personal' AND public.member_is_ghost(owner_member_id)
                            AND public.trip_role(trip_id) in ('host','editor'))
    OR (scope = 'personal' AND public.member_user_id(owner_member_id) = auth.uid())
  )
);

create policy "packing_update" on public.packing_items for update
  using  ( /* same predicate as insert */ )
  with check ( /* same predicate as insert */ );

create policy "packing_delete" on public.packing_items for delete
  using  ( /* same predicate as insert */ );
```

So: shared writes = host/editor; a ghost's personal writes = host/editor; a real member's own
personal writes = that member (any role, incl. viewer). This full-edit path deliberately does
**not** let a viewer tick a shared item — that carve-out is the RPC below.

### The check-off RPC (`set_packing_packed`) — "if you can see it, you can tick it"

Postgres RLS is row-level, not column-level, so "a viewer may change `packed` but not `title`"
can't be an RLS policy. Rather than column GRANTs (can't distinguish host/editor from viewer —
both are `authenticated`) or a BEFORE-UPDATE trigger (more moving parts), a `SECURITY DEFINER`
RPC gates the single `packed` flip — matching the #2b precedent (`invite_member`/
`respond_invite`/… are all `SECURITY DEFINER` RPCs for cross-cutting writes).

```sql
create or replace function public.set_packing_packed(p_item_id uuid, p_packed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_trip uuid; v_scope text; v_owner uuid;
begin
  select trip_id, scope, owner_member_id into v_trip, v_scope, v_owner
    from packing_items where id = p_item_id;
  if v_trip is null then raise exception 'not found'; end if;

  -- same visibility predicate as packing_select: see it => tick it
  if not (public.is_trip_member(v_trip) AND (
        v_scope = 'shared'
     OR public.member_user_id(v_owner) = auth.uid()
     OR public.member_is_ghost(v_owner)
  )) then raise exception 'forbidden'; end if;

  update packing_items set packed = p_packed where id = p_item_id;
end $$;

grant execute on function public.set_packing_packed(uuid, boolean) to authenticated;
```

Full edits still route through the stricter write RLS; only `packed` goes through this RPC.

---

## 3. Category config (single source of truth)

Per the one-source-of-truth rule (label + glyph + color defined together), `src/lib/packingCategories.js`:

```
PACKING_CATEGORIES = {
  documents:   { label: 'Documents',   glyph: '📄', color: '#0EA5E9' },
  clothing:    { label: 'Clothing',    glyph: '👕', color: '#22C55E' },
  toiletries:  { label: 'Toiletries',  glyph: '🧴', color: '#EC4899' },
  electronics: { label: 'Electronics', glyph: '🔌', color: '#A855F7' },
  gear:        { label: 'Gear',        glyph: '🎒', color: '#F59E0B' },
  other:       { label: 'Other',       glyph: '📦', color: '#64748B' },
}
PACKING_CATEGORY_ORDER = ['documents','clothing','toiletries','electronics','gear','other']
```

Drives the modal's category chips, the list's category headers, and their fixed order.

---

## 4. Data flow

- **Read** — extend `useTrip`'s embedded select to also pull `packing_items(*)` (RLS auto-filters
  personal rows per user; one round-trip, no N+1 — same pattern as `plan_items` / `transport`):
  ```js
  '*, trip_members(id, user_id, display_name, role, invite_status, profiles(display_name, avatar_url)), transport(*), plan_items(*), packing_items(*)'
  ```
  The Packing page reads `trip.packing_items` and partitions client-side via `lib/packing.js`.
  Because RLS already stripped other members' personal rows, the client only ever holds what the
  viewer may see — it never has to hide anything.
- **Mutations (all invalidate `['trip', tripId]`):**
  - `useUpsertPackingItem(tripId)` — insert (no `id`) / update (with `id`); carries `scope`,
    `owner_member_id`, `category`, `title`, `assignee_member_id`.
  - `useDeletePackingItem(tripId)` — delete by `id`.
  - `useTogglePacked(tripId)` — calls the `set_packing_packed` RPC; **optimistic** (checkbox flips
    instantly, rolls back on error — check-off is high-frequency; mirrors the optimistic
    `useScheduleItem` from #3b).

---

## 5. UI — sidebar (master-detail) layout

The page is a **two-pane** layout: a left **rail** of lists and a right **pane** showing the
selected list. Chosen over a single vertical stack of all lists because it scales (5 ghosts = 5
rail buttons, not 5 giant stacked sections) and shows one list at a time with little scrolling.
Collapses to a single column on narrow screens (rail on top).

### `Packing` page
Reads `trip` from outlet context, derives `callerMember` + `canWrite` (reuse `lib/tripAccess`),
owns the **selected-list** state and the **editor-modal** state. Partitions `trip.packing_items`
via `lib/packing.js` into `{ shared, mine, ghostLists[] }`.

### `PackingRail` (left)
- **Overall progress** card at top — a boarding-pass-style accent bar + "packed / total" (across
  everything the viewer can see) + a meter.
- **List buttons:** 🎒 **Shared**, 🧳 **Your list** (Private tag), then a **Ghost travellers**
  group with one button per ghost (avatar + Ghost tag). Each button shows a mini progress
  bar/count, so all lists' status is scannable at a glance. Active list highlighted; rail sticky.
- The "Ghost travellers" group is omitted when there are no ghosts.

### `PackingList` (right pane, for the selected list)
- **Header:** the list title, its "packed / total", and (when the caller may add to this list) a
  **+ Add item** button.
- **Visibility hint:** one subtle line per scope (shared = "visible to everyone; anyone ticks,
  host/editor edits"; personal = "private to you"; ghost = "visible to all contributors, managed
  by host/editor").
- **Items grouped under the 6 category headers** (fixed config order; empty categories hidden),
  each header with a per-category count. Items flow in a **two-column** layout so a whole list
  fits with minimal scroll.
- **Empty list** → "Nothing packed yet" prompt with the + Add (if the caller may add).

### `PackingItemRow`
- **Checkbox** — interactive for anyone who can *see* the row (calls `useTogglePacked`); packed
  rows show strikethrough + dimmed.
- **Title** + category glyph.
- **Shared only:** an **assignee chip** (avatar/initial + name, or a dashed "Unassigned" pill);
  clicking it (host/editor) opens the assignee picker.
- **✎ / ✕** — host/editor for shared + ghost lists; the owner for their own list — with
  `stopPropagation` so they don't toggle the checkbox.

### `PackingItemEditorModal` (adaptive; reuses `Modal`)
- **Title** first → **category chips** (the 6, colored/glyphed from the config) → for **shared**
  scope only, an **assignee** dropdown (trip members incl. ghosts; "Unassigned" default).
- Opened by a section's **+ Add** with `scope` + `owner_member_id` preset (add on "Your list" →
  personal/you; add on a ghost list → that ghost; add on Shared → shared). **✎** reopens
  pre-filled (edit = update). **✕** removes after a confirm.
- Inline error on failure; modal stays open, input preserved; submit disabled while pending
  (same contract as `TransportEditorModal` / `SuggestionEditorModal`).

### Permissions (UI mirrors RLS for UX only; RLS/RPC is the trust boundary)
- **Shared:** host/editor add/edit/assign/delete; **anyone** ticks packed.
- **Own personal:** the owner (any role, incl. viewer) has full control.
- **Ghost personal:** host/editor add/edit/delete; anyone who can see it ticks packed; a viewer
  sees ghost lists read-only (but can still tick).

---

## 6. Validation (client mirror; DB/RLS/RPC is the trust boundary)

- **Item:** title (trimmed, required), category (required, one of the 6). `assignee_member_id`
  optional and only meaningful for shared scope.
- Server enforces the same via the CHECK constraints + RLS predicates; the RPC re-checks
  visibility before flipping `packed`.

---

## 7. Error handling & edge cases

- **Load fails** → inline error + retry (mirrors Overview/Planning); never a blank pane.
- **Empty list** → "Nothing packed yet" prompt with the section's + Add (when the caller may add).
- **Viewer** → own personal list fully editable; shared + ghost lists render read-only **but
  checkboxes still tick** (anyone can pack). No + Add / ✎ / ✕ on those.
- **No ghosts** → the "Ghost travellers" rail group is omitted.
- **Assignee removed** (member deleted in #2b) → `assignee_member_id` nulls → chip falls back to
  "Unassigned".
- **Owner removed** → their personal items cascade-delete; their rail entry disappears.
- **Toggle RPC fails** → the optimistic flip rolls back + an inline toast.
- **Save fails** (network/validation) → inline modal error; modal stays open, input preserved.

---

## 8. Component / file structure

```
src/lib/packingCategories.js               6-category config {key:{label,glyph,color}} + order (single source of truth)
src/lib/packing.js                         pure: partition(items, members, authUserId) → {shared, mine, ghostLists[]};
                                             groupByCategory(items); progress(items) → {packed, total}
src/hooks/useTrip.js (modify)              add packing_items(*) to the embedded select
src/hooks/useUpsertPackingItem.js          insert/update a packing item
src/hooks/useDeletePackingItem.js          delete by id
src/hooks/useTogglePacked.js               optimistic RPC call to set_packing_packed
src/components/PackingRail.jsx + css        left rail: overall progress + list buttons (mini progress, tags)
src/components/PackingList.jsx + css        right pane: header + visibility hint + category-grouped two-col rows
src/components/PackingItemRow.jsx + css     checkbox · title · (shared) assignee chip · ✎/✕
src/components/PackingItemEditorModal.jsx + css  adaptive add/edit (title → category chips → assignee if shared)
src/pages/Packing.jsx + css                 two-pane page: rail | active list; selected-list state; modal state
src/App.jsx (modify)                        /packing route → <Packing/> (replace ComingSoon)
```

Reuses from #0–#3: `Modal`, `callerMember`/`canWrite` (`lib/tripAccess`), `initials`
(`lib/display`), the `is_trip_member` / `trip_role` RLS helpers, design tokens. Each unit is
single-purpose: config is data-only; `packing.js` holds all pure logic; the rail only navigates;
the list only groups/renders; the row only displays + toggles; the modal only collects + routes;
the page wires.

---

## 9. Testing (Vitest + React Testing Library; RLS via SQL checks in the plan)

- **`packingCategories`** — config completeness (every category has label + glyph + color; order
  covers all keys).
- **`lib/packing.js`** — `partition` splits shared / mine / ghost-lists by scope + owner +
  authUser; `groupByCategory` (fixed order, empty categories dropped); `progress` counts
  packed/total.
- **Hooks** — `useUpsertPackingItem` (insert vs update by presence of `id`),
  `useDeletePackingItem`, `useTogglePacked` (calls the RPC; optimistic update + rollback on
  error), `useTrip` select includes `packing_items` (mocked supabase; invalidations).
- **`PackingItemEditorModal`** — title required blocks save; assignee field shows only for shared
  scope; valid save routes to the mutation with mapped params (scope/owner preset).
- **`PackingItemRow`** — checkbox toggles for anyone; assignee chip only on shared; ✎/✕ gated by
  `canEdit` + `stopPropagation`.
- **`PackingList`** — groups by category (fixed order, empties hidden); per-scope visibility hint;
  + Add gated by permission.
- **`PackingRail`** — one button per list, overall + per-list progress, ghost group present only
  with ghosts; active switching selects the pane.
- **`Packing`** — renders rail + active list from context; viewer sees own list editable and
  shared/ghost read-only-but-tickable.
- **RLS / RPC (SQL checks in the plan, not Vitest):**
  - a member reads shared rows; a non-member is denied everything;
  - a real member **cannot** read another real member's personal rows;
  - **any** member reads a ghost's personal rows;
  - a viewer **cannot** insert/update/delete a shared row;
  - an owner **can** insert/update/delete their own personal rows;
  - a host/editor **can** write a ghost's personal rows;
  - `set_packing_packed` lets **any** member flip a shared item's `packed`, lets an owner flip
    their own, lets a host/editor flip a ghost's, and **rejects** a non-member.

---

## 10. Out of scope (restated)

Quantity/note fields, packing templates / "common items" suggestions, packing reminders or
notifications, export/print → possible future slice. Finance → #5, Discussion → #6. #4 delivers
the collaborative shared + personal packing checklist and its full data model only.
