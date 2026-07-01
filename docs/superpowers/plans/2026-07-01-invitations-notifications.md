# Invitations, Ghost Joiners & Notifications (#2b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trip host can invite existing users by email (with a role), add ghost joiners by name, and revoke/remove members; invitees accept/decline from a working notification bell; co-members can read each other's profiles.

**Architecture:** All membership + notification writes go through `SECURITY DEFINER` RPCs (the established `create_trip` pattern) — each performs its membership change *and* authors the cross-user notification atomically, so `trip_members` and `notifications` stay SELECT-only for clients (no forged notifications, no half-states). Reads are plain RLS-guarded react-query selects. The UI adds a bell dropdown (`NotificationBell`), a dual-mode `AddTravellerModal`, and extends `TravellerList` with a pending tag + host-only remove.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS), `react-router-dom`, `@tanstack/react-query`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-01-invitations-notifications-design.md`

**Branch:** `feat/invitations-notifications` (create at execution start; the repo currently sits on `main`)

**Test commands:** `npm run test:run` (all) · `npx vitest run <path>` (one file). Never leave `vitest` in watch mode in CI.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/notifications.js` + test | notification presentation config (type → icon, actionable, text builder) — single source of truth |
| `src/hooks/useNotifications.js` + test | react-query read of the caller's notifications + derived `unreadCount` |
| `src/hooks/useMarkNotificationsRead.js` + test | mutation: `mark_notifications_read` RPC |
| `src/hooks/useInviteMember.js` + test | mutation: `invite_member` RPC |
| `src/hooks/useRespondInvite.js` + test | mutation: `respond_invite` RPC |
| `src/hooks/useAddGhost.js` + test | mutation: `add_ghost` RPC |
| `src/hooks/useRemoveMember.js` + test | mutation: `remove_member` RPC |
| `src/components/NotificationItem.jsx` + `.module.css` + test | render one notification by type (+ accept/decline) |
| `src/components/NotificationBell.jsx` + `.module.css` + test | bell + unread badge + dropdown; marks read on open |
| `src/components/AddTravellerModal.jsx` + `.module.css` + test | invite-by-email / add-ghost toggle (reuses `Modal`) |
| `src/components/TravellerList.jsx` (modify) + `.module.css` (extend) + test | pending tag + host-only add/remove affordances |
| `src/components/DashboardLayout.jsx` (modify) + test (modify) | swap decorative bell → `<NotificationBell/>` |
| `src/pages/Overview.jsx` (modify) + test (modify) | wire host-only add-traveller + remove |

Reuses from #0/#1/#2a: `Modal`, `BellIcon`, `useAuth`, `supabase`, `initials` (`lib/display`), `callerMember` (`lib/tripAccess`), design tokens.

---

## Task 1: Supabase backend — `notifications` table, `profiles` broadening, FK fix, and the 5 RPCs

Runs SQL in the Supabase dashboard. No repo changes; no commit. Verified by SQL + the Task 15 smoke test.

- [ ] **Step 1: Create the table, RLS, helper, policy, FK fix, and RPCs**

Supabase Dashboard → SQL Editor → run:

```sql
-- 1. Notifications: the bell/inbox. Writes only via RPCs -----------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  recipient  uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('invite_received','invite_accepted','invite_declined')),
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (recipient, created_at desc);

alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications
  for select using (recipient = auth.uid());
grant select on public.notifications to authenticated;

-- 2. Broaden profiles: members of a shared trip can read each other ------------
create or replace function public.shares_accepted_trip(p_user uuid)
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

-- 3. Removing a member must not delete their transport legs --------------------
alter table public.transport drop constraint if exists transport_created_by_fkey;
alter table public.transport add constraint transport_created_by_fkey
  foreign key (created_by) references public.trip_members(id) on delete set null;

-- 4. RPCs (all SECURITY DEFINER; author membership + notification atomically) --
create or replace function public.invite_member(p_trip_id uuid, p_email text, p_role text)
returns trip_members language plpgsql security definer set search_path = public as $$
declare v_member trip_members; v_user profiles; v_trip trips; v_actor text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if public.trip_role(p_trip_id) <> 'host' then raise exception 'only the host can invite'; end if;
  if p_role not in ('editor','viewer') then raise exception 'invalid role'; end if;

  select * into v_user from profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_user.id is null then raise exception 'no user found'; end if;
  if v_user.id = auth.uid() then raise exception 'you are already on this trip'; end if;
  if exists (select 1 from trip_members where trip_id = p_trip_id and user_id = v_user.id) then
    raise exception 'already invited or a member';
  end if;

  insert into trip_members (trip_id, user_id, role, invite_status)
  values (p_trip_id, v_user.id, p_role, 'pending') returning * into v_member;

  select * into v_trip from trips where id = p_trip_id;
  select display_name into v_actor from profiles where id = auth.uid();

  insert into notifications (recipient, type, payload)
  values (v_user.id, 'invite_received', jsonb_build_object(
    'trip_id', v_trip.id, 'trip_name', v_trip.name, 'trip_code', v_trip.code,
    'actor_name', v_actor, 'role', p_role));

  return v_member;
end; $$;

create or replace function public.respond_invite(p_trip_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_member trip_members; v_trip trips; v_actor text; v_host uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_member from trip_members
  where trip_id = p_trip_id and user_id = auth.uid() and invite_status = 'pending' limit 1;
  if v_member.id is null then raise exception 'no pending invite'; end if;

  select * into v_trip from trips where id = p_trip_id;
  select display_name into v_actor from profiles where id = auth.uid();
  select user_id into v_host from trip_members where trip_id = p_trip_id and role = 'host' limit 1;

  if p_accept then
    update trip_members set invite_status = 'accepted' where id = v_member.id;
  else
    delete from trip_members where id = v_member.id;
  end if;

  update notifications set read_at = now()
  where recipient = auth.uid() and type = 'invite_received'
    and payload->>'trip_id' = p_trip_id::text and read_at is null;

  if v_host is not null then
    insert into notifications (recipient, type, payload)
    values (v_host, case when p_accept then 'invite_accepted' else 'invite_declined' end,
      jsonb_build_object('trip_id', v_trip.id, 'trip_name', v_trip.name,
        'trip_code', v_trip.code, 'actor_name', v_actor));
  end if;
end; $$;

create or replace function public.add_ghost(p_trip_id uuid, p_name text)
returns trip_members language plpgsql security definer set search_path = public as $$
declare v_member trip_members;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if public.trip_role(p_trip_id) <> 'host' then raise exception 'only the host can add joiners'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'name required'; end if;

  insert into trip_members (trip_id, user_id, display_name, role, invite_status)
  values (p_trip_id, null, trim(p_name), 'viewer', 'accepted') returning * into v_member;
  return v_member;
end; $$;

create or replace function public.remove_member(p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_member trip_members;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_member from trip_members where id = p_member_id;
  if v_member.id is null then raise exception 'member not found'; end if;
  if public.trip_role(v_member.trip_id) <> 'host' then raise exception 'only the host can remove members'; end if;
  if v_member.role = 'host' then raise exception 'the host cannot be removed'; end if;
  delete from trip_members where id = p_member_id;
end; $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update notifications set read_at = now()
  where recipient = auth.uid() and read_at is null
    and (p_ids is null or id = any(p_ids));
end; $$;

grant execute on function public.invite_member(uuid, text, text),
  public.respond_invite(uuid, boolean), public.add_ghost(uuid, text),
  public.remove_member(uuid), public.mark_notifications_read(uuid[]) to authenticated;
```

- [ ] **Step 2: Verify**

```sql
select policyname, cmd from pg_policies where tablename in ('notifications','profiles') order by tablename, policyname;
```
Expected includes `notifications_select_own` (SELECT), `profiles_select_own` (from #0), `profiles_select_comembers` (SELECT).

```sql
select proname from pg_proc where proname in
  ('invite_member','respond_invite','add_ghost','remove_member','mark_notifications_read','shares_accepted_trip')
order by proname;
```
Expected: all six rows.

```sql
select confdeltype from pg_constraint where conname = 'transport_created_by_fkey';
```
Expected: `n` (SET NULL).

No commit — database only.

---

## Task 2: `lib/notifications.js` — presentation config (single source of truth)

**Files:**
- Create: `src/lib/notifications.js`
- Test: `src/lib/notifications.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/notifications.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TYPES, notificationMeta, notificationText } from './notifications'

const payload = { actor_name: 'Ana', trip_name: 'Tokyo Trip', role: 'editor' }

describe('notifications config', () => {
  it('every type has an icon, an actionable flag, and a text builder', () => {
    for (const meta of Object.values(NOTIFICATION_TYPES)) {
      expect(typeof meta.icon).toBe('string')
      expect(typeof meta.actionable).toBe('boolean')
      expect(typeof meta.text).toBe('function')
    }
  })

  it('only invite_received is actionable', () => {
    expect(NOTIFICATION_TYPES.invite_received.actionable).toBe(true)
    expect(NOTIFICATION_TYPES.invite_accepted.actionable).toBe(false)
    expect(NOTIFICATION_TYPES.invite_declined.actionable).toBe(false)
  })

  it('builds readable text from the payload', () => {
    expect(notificationText({ type: 'invite_received', payload })).toBe('Ana invited you to Tokyo Trip as editor')
    expect(notificationText({ type: 'invite_accepted', payload })).toBe('Ana accepted your invite to Tokyo Trip')
    expect(notificationText({ type: 'invite_declined', payload })).toBe('Ana declined your invite to Tokyo Trip')
  })

  it('returns null meta / empty text for an unknown type', () => {
    expect(notificationMeta('nope')).toBeNull()
    expect(notificationText({ type: 'nope', payload: {} })).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/notifications.test.js`
Expected: FAIL — cannot import from `./notifications`.

- [ ] **Step 3: Implement**

Create `src/lib/notifications.js`:

```js
// Single source of truth for how each notification type is presented.
export const NOTIFICATION_TYPES = {
  invite_received: {
    icon: '✉',
    actionable: true,
    text: (p) => `${p.actor_name} invited you to ${p.trip_name} as ${p.role}`,
  },
  invite_accepted: {
    icon: '✓',
    actionable: false,
    text: (p) => `${p.actor_name} accepted your invite to ${p.trip_name}`,
  },
  invite_declined: {
    icon: '✕',
    actionable: false,
    text: (p) => `${p.actor_name} declined your invite to ${p.trip_name}`,
  },
}

export function notificationMeta(type) {
  return NOTIFICATION_TYPES[type] ?? null
}

export function notificationText(notification) {
  const meta = NOTIFICATION_TYPES[notification.type]
  return meta ? meta.text(notification.payload ?? {}) : ''
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/notifications.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.js src/lib/notifications.test.js
git commit -m "feat: add notification presentation config (single source of truth)"
```

---

## Task 3: `useNotifications` — read + unread count

**Files:**
- Create: `src/hooks/useNotifications.js`
- Test: `src/hooks/useNotifications.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useNotifications.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { order, select, from } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))
  return { order, select, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { useNotifications } from './useNotifications'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useNotifications', () => {
  it('reads notifications newest-first and derives unreadCount', async () => {
    order.mockResolvedValue({
      data: [
        { id: 'n1', type: 'invite_received', read_at: null, payload: {} },
        { id: 'n2', type: 'invite_accepted', read_at: '2026-07-01T00:00:00Z', payload: {} },
      ],
      error: null,
    })
    const { result } = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(from).toHaveBeenCalledWith('notifications')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.current.unreadCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useNotifications.test.jsx`
Expected: FAIL — cannot import `./useNotifications`.

- [ ] **Step 3: Implement**

Create `src/hooks/useNotifications.js`:

```js
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

// RLS limits rows to recipient = auth.uid(); no explicit filter needed.
export function useNotifications() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const items = query.data ?? []
  const unreadCount = items.filter((n) => !n.read_at).length
  return { ...query, items, unreadCount }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useNotifications.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotifications.js src/hooks/useNotifications.test.jsx
git commit -m "feat: add useNotifications hook (read + unread count)"
```

---

## Task 4: `useMarkNotificationsRead` — mutation

**Files:**
- Create: `src/hooks/useMarkNotificationsRead.js`
- Test: `src/hooks/useMarkNotificationsRead.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useMarkNotificationsRead.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { useMarkNotificationsRead } from './useMarkNotificationsRead'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useMarkNotificationsRead', () => {
  it('calls the RPC with the given ids (or null for all)', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper })
    result.current.mutate(null)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: null })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useMarkNotificationsRead.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

Create `src/hooks/useMarkNotificationsRead.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (ids = null) => {
      const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useMarkNotificationsRead.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMarkNotificationsRead.js src/hooks/useMarkNotificationsRead.test.jsx
git commit -m "feat: add useMarkNotificationsRead mutation"
```

---

## Task 5: `useInviteMember` — mutation

**Files:**
- Create: `src/hooks/useInviteMember.js`
- Test: `src/hooks/useInviteMember.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useInviteMember.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useInviteMember } from './useInviteMember'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useInviteMember', () => {
  it('calls invite_member with trip id, email, role and invalidates the trip', async () => {
    rpc.mockResolvedValue({ data: { id: 'm2' }, error: null })
    const { result } = renderHook(() => useInviteMember('t1'), { wrapper })
    result.current.mutate({ email: 'b@x.com', role: 'editor' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('invite_member', { p_trip_id: 't1', p_email: 'b@x.com', p_role: 'editor' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'no user found' } })
    const { result } = renderHook(() => useInviteMember('t1'), { wrapper })
    result.current.mutate({ email: 'x@y.com', role: 'viewer' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error.message).toBe('no user found')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useInviteMember.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

Create `src/hooks/useInviteMember.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useInviteMember(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, role }) => {
      const { data, error } = await supabase.rpc('invite_member', {
        p_trip_id: tripId,
        p_email: email,
        p_role: role,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useInviteMember.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useInviteMember.js src/hooks/useInviteMember.test.jsx
git commit -m "feat: add useInviteMember mutation"
```

---

## Task 6: `useRespondInvite` — mutation

**Files:**
- Create: `src/hooks/useRespondInvite.js`
- Test: `src/hooks/useRespondInvite.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useRespondInvite.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useRespondInvite } from './useRespondInvite'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useRespondInvite', () => {
  it('accepts an invite and invalidates notifications, trips, and the trip', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useRespondInvite(), { wrapper })
    result.current.mutate({ tripId: 't1', accept: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('respond_invite', { p_trip_id: 't1', p_accept: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips', 'u1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useRespondInvite.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

Create `src/hooks/useRespondInvite.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useRespondInvite() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ tripId, accept }) => {
      const { error } = await supabase.rpc('respond_invite', { p_trip_id: tripId, p_accept: accept })
      if (error) throw error
    },
    onSuccess: (_data, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['trips', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
    },
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useRespondInvite.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRespondInvite.js src/hooks/useRespondInvite.test.jsx
git commit -m "feat: add useRespondInvite mutation"
```

---

## Task 7: `useAddGhost` — mutation

**Files:**
- Create: `src/hooks/useAddGhost.js`
- Test: `src/hooks/useAddGhost.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAddGhost.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useAddGhost } from './useAddGhost'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useAddGhost', () => {
  it('calls add_ghost with trip id + name and invalidates the trip', async () => {
    rpc.mockResolvedValue({ data: { id: 'm3' }, error: null })
    const { result } = renderHook(() => useAddGhost('t1'), { wrapper })
    result.current.mutate('Grandpa Joe')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('add_ghost', { p_trip_id: 't1', p_name: 'Grandpa Joe' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useAddGhost.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

Create `src/hooks/useAddGhost.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useAddGhost(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name) => {
      const { data, error } = await supabase.rpc('add_ghost', { p_trip_id: tripId, p_name: name })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useAddGhost.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAddGhost.js src/hooks/useAddGhost.test.jsx
git commit -m "feat: add useAddGhost mutation"
```

---

## Task 8: `useRemoveMember` — mutation

**Files:**
- Create: `src/hooks/useRemoveMember.js`
- Test: `src/hooks/useRemoveMember.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useRemoveMember.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, invalidate } = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig()
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) }
})

import { useRemoveMember } from './useRemoveMember'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useRemoveMember', () => {
  it('calls remove_member with the member id and invalidates the trip', async () => {
    rpc.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useRemoveMember('t1'), { wrapper })
    result.current.mutate('m2')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('remove_member', { p_member_id: 'm2' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't1'] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useRemoveMember.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement**

Create `src/hooks/useRemoveMember.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useRemoveMember(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberId) => {
      const { error } = await supabase.rpc('remove_member', { p_member_id: memberId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useRemoveMember.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRemoveMember.js src/hooks/useRemoveMember.test.jsx
git commit -m "feat: add useRemoveMember mutation"
```

---

## Task 9: `NotificationItem` — render one notification

**Files:**
- Create: `src/components/NotificationItem.jsx`, `src/components/NotificationItem.module.css`
- Test: `src/components/NotificationItem.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/NotificationItem.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationItem } from './NotificationItem'

const received = {
  id: 'n1', type: 'invite_received', read_at: null,
  payload: { trip_id: 't1', actor_name: 'Ana', trip_name: 'Tokyo Trip', role: 'editor' },
}
const accepted = {
  id: 'n2', type: 'invite_accepted', read_at: '2026-07-01T00:00:00Z',
  payload: { trip_id: 't1', actor_name: 'Ben', trip_name: 'Tokyo Trip' },
}

describe('NotificationItem', () => {
  it('renders invite_received text with Accept/Decline that call the handlers', async () => {
    const onAccept = vi.fn(); const onDecline = vi.fn()
    render(<NotificationItem notification={received} onAccept={onAccept} onDecline={onDecline} />)
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(onAccept).toHaveBeenCalledWith(received)
    await userEvent.click(screen.getByRole('button', { name: /decline/i }))
    expect(onDecline).toHaveBeenCalledWith(received)
  })

  it('renders an informational notification with no action buttons', () => {
    render(<NotificationItem notification={accepted} onAccept={vi.fn()} onDecline={vi.fn()} />)
    expect(screen.getByText('Ben accepted your invite to Tokyo Trip')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
  })

  it('renders nothing for an unknown type', () => {
    const { container } = render(
      <NotificationItem notification={{ id: 'x', type: 'nope', payload: {} }} onAccept={vi.fn()} onDecline={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/NotificationItem.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement the component**

Create `src/components/NotificationItem.jsx`:

```jsx
import { notificationMeta, notificationText } from '../lib/notifications'
import styles from './NotificationItem.module.css'

export function NotificationItem({ notification, onAccept, onDecline, pending }) {
  const meta = notificationMeta(notification.type)
  if (!meta) return null
  return (
    <li className={`${styles.item} ${notification.read_at ? '' : styles.unread}`}>
      <span className={styles.icon} aria-hidden="true">{meta.icon}</span>
      <div className={styles.body}>
        <p className={styles.text}>{notificationText(notification)}</p>
        {meta.actionable && (
          <div className={styles.actions}>
            <button type="button" className={styles.accept} disabled={pending}
              onClick={() => onAccept(notification)}>Accept</button>
            <button type="button" className={styles.decline} disabled={pending}
              onClick={() => onDecline(notification)}>Decline</button>
          </div>
        )}
      </div>
    </li>
  )
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/NotificationItem.module.css`:

```css
.item {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.unread { background: var(--c-mist); }
.icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--c-mist);
  color: var(--primary-strong);
  font-size: 14px;
}
.body { flex: 1; min-width: 0; }
.text { margin: 0; font-size: 14px; color: var(--ink); line-height: 1.4; }
.actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
.accept, .decline {
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border);
}
.accept { background: var(--primary); border-color: var(--primary); color: #fff; }
.decline { background: transparent; color: var(--ink); }
.accept:disabled, .decline:disabled { opacity: 0.5; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/NotificationItem.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/NotificationItem.jsx src/components/NotificationItem.module.css src/components/NotificationItem.test.jsx
git commit -m "feat: add NotificationItem component"
```

---

## Task 10: `NotificationBell` — bell + badge + dropdown

**Files:**
- Create: `src/components/NotificationBell.jsx`, `src/components/NotificationBell.module.css`
- Test: `src/components/NotificationBell.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/NotificationBell.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
vi.mock('../hooks/useMarkNotificationsRead', () => ({ useMarkNotificationsRead: vi.fn() }))
vi.mock('../hooks/useRespondInvite', () => ({ useRespondInvite: vi.fn() }))

import { useNotifications } from '../hooks/useNotifications'
import { useMarkNotificationsRead } from '../hooks/useMarkNotificationsRead'
import { useRespondInvite } from '../hooks/useRespondInvite'
import { NotificationBell } from './NotificationBell'

const invite = {
  id: 'n1', type: 'invite_received', read_at: null,
  payload: { trip_id: 't1', actor_name: 'Ana', trip_name: 'Tokyo Trip', role: 'editor' },
}

beforeEach(() => {
  vi.clearAllMocks()
  useMarkNotificationsRead.mockReturnValue({ mutate: vi.fn() })
  useRespondInvite.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

describe('NotificationBell', () => {
  it('shows the unread badge count', () => {
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('opens the panel and marks read on open, listing notifications', async () => {
    const mark = vi.fn()
    useMarkNotificationsRead.mockReturnValue({ mutate: mark })
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(mark).toHaveBeenCalledWith(null)
    expect(screen.getByText('Ana invited you to Tokyo Trip as editor')).toBeInTheDocument()
  })

  it('accepting an invite responds with the payload trip id', async () => {
    const respond = vi.fn()
    useRespondInvite.mockReturnValue({ mutate: respond, isPending: false })
    useNotifications.mockReturnValue({ items: [invite], unreadCount: 1 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    await userEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(respond).toHaveBeenCalledWith({ tripId: 't1', accept: true })
  })

  it('shows an empty state when there are no notifications', async () => {
    useNotifications.mockReturnValue({ items: [], unreadCount: 0 })
    render(<NotificationBell />)
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/NotificationBell.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement the component**

Create `src/components/NotificationBell.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { BellIcon } from './BellIcon'
import { NotificationItem } from './NotificationItem'
import { useNotifications } from '../hooks/useNotifications'
import { useMarkNotificationsRead } from '../hooks/useMarkNotificationsRead'
import { useRespondInvite } from '../hooks/useRespondInvite'
import styles from './NotificationBell.module.css'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const { items, unreadCount } = useNotifications()
  const markRead = useMarkNotificationsRead()
  const respond = useRespondInvite()

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unreadCount > 0) markRead.mutate(null)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button type="button" className={styles.iconBtn} aria-label="Notifications"
        aria-expanded={open} onClick={toggle}>
        <BellIcon className={styles.bell} />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-label={`${unreadCount} unread`}>{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className={styles.panel}>
          <p className={styles.head}>Notifications</p>
          {items.length === 0 ? (
            <p className={styles.empty}>No notifications yet.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <NotificationItem key={n.id} notification={n} pending={respond.isPending}
                  onAccept={(x) => respond.mutate({ tripId: x.payload.trip_id, accept: true })}
                  onDecline={(x) => respond.mutate({ tripId: x.payload.trip_id, accept: false })} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/NotificationBell.module.css`:

```css
.root { position: relative; }
.iconBtn {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--ink-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 50%;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.iconBtn:hover { color: var(--primary-strong); background: var(--c-mist); }
.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--c-sunset, #f97316);
  border-radius: 9px;
}
.panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  z-index: 20;
}
.head {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink-muted);
  border-bottom: 1px solid var(--border);
}
.empty { margin: 0; padding: var(--space-5) var(--space-4); font-size: 14px; color: var(--ink-muted); text-align: center; }
.list { list-style: none; margin: 0; padding: 0; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/NotificationBell.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/NotificationBell.jsx src/components/NotificationBell.module.css src/components/NotificationBell.test.jsx
git commit -m "feat: add NotificationBell dropdown"
```

---

## Task 11: Wire `NotificationBell` into `DashboardLayout`

**Files:**
- Modify: `src/components/DashboardLayout.jsx`
- Modify: `src/components/DashboardLayout.module.css` (remove now-unused `.iconBtn`/`.bell` if present)
- Modify: `src/components/DashboardLayout.test.jsx`

- [ ] **Step 1: Update the DashboardLayout test to mock the bell**

In `src/components/DashboardLayout.test.jsx`, add this mock near the top (after the existing `vi.mock('../auth/AuthContext', …)` line):

```jsx
vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Notifications" />,
}))
```

The existing assertions (a button named `/notifications/i` exists) continue to hold via the stub.

- [ ] **Step 2: Sanity-run the test (still green)**

Run: `npx vitest run src/components/DashboardLayout.test.jsx`
Expected: PASS — this is a wiring task, not a red/green cycle. The mock is currently unused (the inline button still satisfies the assertions); Step 3 swaps in the real component so the mock is what keeps the test meaningful afterward.

- [ ] **Step 3: Swap the inline button for the component**

In `src/components/DashboardLayout.jsx`, replace the `BellIcon` import with the bell component and swap the button. Change the import line:

```jsx
import { BellIcon } from './BellIcon'
```
to:
```jsx
import { NotificationBell } from './NotificationBell'
```

Then replace this block:

```jsx
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Notifications"
          >
            <BellIcon className={styles.bell} />
          </button>
```
with:
```jsx
          <NotificationBell />
```

- [ ] **Step 4: Remove the now-unused styles**

In `src/components/DashboardLayout.module.css`, delete the `.iconBtn`, `.iconBtn:hover`, and any `.bell` rules (the bell button styling now lives in `NotificationBell.module.css`). Leave `.actions`, `.signout`, etc. intact.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/DashboardLayout.test.jsx`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardLayout.jsx src/components/DashboardLayout.module.css src/components/DashboardLayout.test.jsx
git commit -m "feat: wire NotificationBell into the dashboard top bar"
```

---

## Task 12: `AddTravellerModal` — invite / add-ghost toggle

**Files:**
- Create: `src/components/AddTravellerModal.jsx`, `src/components/AddTravellerModal.module.css`
- Test: `src/components/AddTravellerModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/AddTravellerModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useInviteMember', () => ({ useInviteMember: vi.fn() }))
vi.mock('../hooks/useAddGhost', () => ({ useAddGhost: vi.fn() }))

import { useInviteMember } from '../hooks/useInviteMember'
import { useAddGhost } from '../hooks/useAddGhost'
import { AddTravellerModal } from './AddTravellerModal'

beforeEach(() => {
  vi.clearAllMocks()
  useInviteMember.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useAddGhost.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

describe('AddTravellerModal', () => {
  it('blocks invite when the email is invalid', async () => {
    const invite = vi.fn()
    useInviteMember.mockReturnValue({ mutate: invite, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(invite).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
  })

  it('invites with a valid email and the chosen role', async () => {
    const invite = vi.fn()
    useInviteMember.mockReturnValue({ mutate: invite, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'b@x.com')
    await userEvent.click(screen.getByRole('button', { name: /^viewer$/i }))
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(invite).toHaveBeenCalledWith({ email: 'b@x.com', role: 'viewer' }, expect.any(Object))
  })

  it('switches to ghost mode and adds by name', async () => {
    const addGhost = vi.fn()
    useAddGhost.mockReturnValue({ mutate: addGhost, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add ghost/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'Grandpa Joe')
    await userEvent.click(screen.getByRole('button', { name: /add joiner/i }))
    expect(addGhost).toHaveBeenCalledWith('Grandpa Joe', expect.any(Object))
  })

  it('blocks a ghost with an empty name', async () => {
    const addGhost = vi.fn()
    useAddGhost.mockReturnValue({ mutate: addGhost, isPending: false })
    render(<AddTravellerModal tripId="t1" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add ghost/i }))
    await userEvent.click(screen.getByRole('button', { name: /add joiner/i }))
    expect(addGhost).not.toHaveBeenCalled()
    expect(screen.getByText(/enter a name/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/AddTravellerModal.test.jsx`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement the component**

Create `src/components/AddTravellerModal.jsx`:

```jsx
import { useState } from 'react'
import { Modal } from './Modal'
import { useInviteMember } from '../hooks/useInviteMember'
import { useAddGhost } from '../hooks/useAddGhost'
import styles from './AddTravellerModal.module.css'

const MODES = [
  { key: 'invite', label: 'Invite by email' },
  { key: 'ghost', label: 'Add ghost' },
]
const ROLES = [
  { key: 'editor', label: 'Editor' },
  { key: 'viewer', label: 'Viewer' },
]
const EMAIL_RE = /^\S+@\S+\.\S+$/

export function AddTravellerModal({ onClose, tripId }) {
  const [mode, setMode] = useState('invite')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const invite = useInviteMember(tripId)
  const addGhost = useAddGhost(tripId)
  const pending = invite.isPending || addGhost.isPending

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  function submitInvite(e) {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_RE.test(value)) { setError('Enter a valid email address.'); return }
    setError('')
    invite.mutate({ email: value, role }, {
      onSuccess: onClose,
      onError: (err) => setError(
        String(err?.message).includes('no user')
          ? 'No TripPlan user with that email.'
          : String(err?.message).includes('already')
            ? 'That person is already on this trip.'
            : 'Could not send this invite. Please try again.',
      ),
    })
  }

  function submitGhost(e) {
    e.preventDefault()
    const value = name.trim()
    if (!value) { setError('Enter a name.'); return }
    setError('')
    addGhost.mutate(value, {
      onSuccess: onClose,
      onError: () => setError('Could not add this joiner. Please try again.'),
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="Add a traveller">
      <form className={styles.pass} onSubmit={mode === 'invite' ? submitInvite : submitGhost}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>NEW TRAVELLER</p>

          <div className={styles.toggle} role="group" aria-label="Add mode">
            {MODES.map((m) => (
              <button key={m.key} type="button"
                className={`${styles.toggleBtn} ${mode === m.key ? styles.toggleOn : ''}`}
                aria-pressed={mode === m.key}
                onClick={() => switchMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'invite' ? (
            <>
              <label className={styles.label} htmlFor="inv-email">Email</label>
              <input id="inv-email" type="email" className={styles.input}
                value={email} onChange={(e) => setEmail(e.target.value)} />

              <span className={styles.label} id="role-label">Role</span>
              <div className={styles.chips} role="group" aria-labelledby="role-label">
                {ROLES.map((r) => (
                  <button key={r.key} type="button"
                    className={`${styles.chip} ${role === r.key ? styles.chipOn : ''}`}
                    aria-pressed={role === r.key}
                    onClick={() => setRole(r.key)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className={styles.label} htmlFor="ghost-name">Name</label>
              <input id="ghost-name" className={styles.input}
                value={name} onChange={(e) => setName(e.target.value)} />
              <p className={styles.hint}>A ghost joiner has no account — they just appear on the trip.</p>
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={pending}>
              {pending ? 'Saving…' : mode === 'invite' ? 'Send invite' : 'Add joiner'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/AddTravellerModal.module.css`:

```css
.pass { display: flex; background: #fff; border-radius: var(--radius-lg, 16px); overflow: hidden; width: min(420px, 92vw); }
.colbar { flex: none; width: 8px; background: var(--primary); }
.pad { flex: 1; padding: var(--space-5); }
.ey { margin: 0 0 var(--space-3); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; color: var(--ink-muted); }
.toggle { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); }
.toggleBtn {
  flex: 1; padding: var(--space-2); font-size: 13px; font-weight: 600;
  border: 1.5px solid var(--border); border-radius: var(--radius-md);
  background: transparent; color: var(--ink);
}
.toggleOn { border-color: var(--primary); color: var(--primary-strong); background: var(--c-mist); }
.label { display: block; margin: var(--space-3) 0 var(--space-1); font-size: 13px; font-weight: 600; color: var(--ink); }
.input {
  width: 100%; padding: var(--space-2) var(--space-3); font-size: 14px;
  border: 1.5px solid var(--border); border-radius: var(--radius-md); background: #fff;
}
.chips { display: flex; gap: var(--space-2); }
.chip {
  padding: var(--space-2) var(--space-4); font-size: 13px; font-weight: 600;
  border: 1.5px solid var(--border); border-radius: 999px; background: transparent; color: var(--ink);
}
.chipOn { border-color: var(--primary); color: var(--primary-strong); background: var(--c-mist); }
.hint { margin: var(--space-2) 0 0; font-size: 12px; color: var(--ink-muted); }
.error { margin: var(--space-3) 0 0; font-size: 13px; color: #dc2626; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-5); }
.cancel { padding: var(--space-2) var(--space-4); font-weight: 600; background: transparent; border: 1.5px solid var(--border); border-radius: var(--radius-md); color: var(--ink); }
.submit { padding: var(--space-2) var(--space-4); font-weight: 600; background: var(--primary); border: 1.5px solid var(--primary); border-radius: var(--radius-md); color: #fff; }
.submit:disabled { opacity: 0.5; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/AddTravellerModal.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/AddTravellerModal.jsx src/components/AddTravellerModal.module.css src/components/AddTravellerModal.test.jsx
git commit -m "feat: add AddTravellerModal (invite / ghost toggle)"
```

---

## Task 13: Extend `TravellerList` — pending tag + host-only add/remove

**Files:**
- Modify: `src/components/TravellerList.jsx`
- Modify: `src/components/TravellerList.module.css` (add `.pending`, `.remove`, `.addBtn`, `.head`)
- Modify: `src/components/TravellerList.test.jsx` (append)

- [ ] **Step 1: Append the failing tests**

Append to `src/components/TravellerList.test.jsx` (add `vi` to the top import: `import { describe, it, expect, vi } from 'vitest'`, and add `import userEvent from '@testing-library/user-event'`):

```jsx
describe('TravellerList — management affordances', () => {
  const members = [
    { id: 'm1', role: 'host', profiles: { display_name: 'Ana' }, invite_status: 'accepted' },
    { id: 'm2', role: 'editor', profiles: { display_name: 'Ben' }, invite_status: 'pending' },
  ]

  it('marks a pending contributor', () => {
    render(<TravellerList trip={trip(members)} />)
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('hides add/remove affordances when not managing', () => {
    render(<TravellerList trip={trip(members)} />)
    expect(screen.queryByRole('button', { name: /add traveller/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove ben/i })).not.toBeInTheDocument()
  })

  it('shows an add button and per-member remove (except the host) when managing', async () => {
    const onAdd = vi.fn(); const onRemove = vi.fn()
    render(<TravellerList trip={trip(members)} canManage onAdd={onAdd} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /add traveller/i }))
    expect(onAdd).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /remove ana/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove ben/i }))
    expect(onRemove).toHaveBeenCalledWith(members[1])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/TravellerList.test.jsx`
Expected: FAIL — no pending tag / add / remove rendered.

- [ ] **Step 3: Update the component**

Replace `src/components/TravellerList.jsx` with:

```jsx
import { initials } from '../lib/display'
import styles from './TravellerList.module.css'

export function TravellerList({ trip, canManage = false, onAdd, onRemove }) {
  const members = trip.trip_members ?? []
  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.h2}>
          {members.length} {members.length === 1 ? 'Traveller' : 'Travellers'}
        </h2>
        {canManage && onAdd && (
          <button type="button" className={styles.addBtn} onClick={onAdd}>+ Add traveller</button>
        )}
      </div>
      <ul className={styles.list}>
        {members.map((m) => {
          const name = m.profiles?.display_name ?? m.display_name ?? 'Guest'
          const pending = m.invite_status === 'pending'
          return (
            <li key={m.id} className={styles.row}>
              <span className={styles.av} style={{ background: trip.accent_color }}>{initials(name)}</span>
              <span className={styles.name}>{name}</span>
              {pending && <span className={styles.pending}>pending</span>}
              <span className={`${styles.tag} ${m.role === 'host' ? styles.host : ''}`}>{m.role}</span>
              {canManage && m.role !== 'host' && (
                <button type="button" className={styles.remove} aria-label={`Remove ${name}`}
                  onClick={() => onRemove(m)}>✕</button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Add the styles**

Append to `src/components/TravellerList.module.css`:

```css
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.addBtn {
  padding: var(--space-1) var(--space-3); font-size: 13px; font-weight: 600;
  color: var(--primary-strong); background: var(--c-mist);
  border: 1.5px solid var(--border); border-radius: var(--radius-md);
}
.pending {
  padding: 1px 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  color: var(--ink-muted); background: var(--c-mist); border-radius: 999px;
}
.remove {
  margin-left: var(--space-1); width: 24px; height: 24px; display: grid; place-items: center;
  color: var(--ink-muted); background: transparent; border: 1px solid transparent; border-radius: 50%;
}
.remove:hover { color: #dc2626; background: #fef2f2; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/TravellerList.test.jsx`
Expected: PASS (all — the two original tests still pass; `canManage` defaults false and the fixtures lack `invite_status`, so nothing new renders for them).

- [ ] **Step 6: Commit**

```bash
git add src/components/TravellerList.jsx src/components/TravellerList.module.css src/components/TravellerList.test.jsx
git commit -m "feat: add pending tag + host-only add/remove to TravellerList"
```

---

## Task 14: Wire management into `Overview`

**Files:**
- Modify: `src/pages/Overview.jsx`
- Modify: `src/pages/Overview.test.jsx`

- [ ] **Step 1: Update the Overview test**

In `src/pages/Overview.test.jsx`, add these mocks after the existing `vi.mock('../components/EditTripModal', …)` line:

```jsx
vi.mock('../components/AddTravellerModal', () => ({ AddTravellerModal: () => <div>AddTravellerModal</div> }))
vi.mock('../hooks/useRemoveMember', () => ({ useRemoveMember: () => ({ mutate: vi.fn() }) }))
```

Then unmock `TravellerList` for the management tests by replacing the existing line

```jsx
vi.mock('../components/TravellerList', () => ({ TravellerList: () => <div>TravellerList</div> }))
```
with a stub that surfaces whether it received `canManage`:

```jsx
vi.mock('../components/TravellerList', () => ({
  TravellerList: ({ canManage, onAdd }) => (
    <div>
      TravellerList
      {canManage && <button type="button" onClick={onAdd}>add-traveller-proxy</button>}
    </div>
  ),
}))
```

And append these tests inside the `describe('Overview', …)` block:

```jsx
  it('lets a host open the add-traveller modal', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview()
    await userEvent.click(screen.getByRole('button', { name: /add-traveller-proxy/i }))
    expect(screen.getByText('AddTravellerModal')).toBeInTheDocument()
  })

  it('does not offer management to a viewer', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.queryByRole('button', { name: /add-traveller-proxy/i })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/Overview.test.jsx`
Expected: FAIL — `Overview` doesn't yet pass `canManage`/`onAdd` or render `AddTravellerModal`.

- [ ] **Step 3: Update the page**

Replace `src/pages/Overview.jsx` with:

```jsx
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { countdownLabel, nights, monthDay } from '../lib/tripDates'
import { useRemoveMember } from '../hooks/useRemoveMember'
import { TransportSection } from '../components/TransportSection'
import { TravellerList } from '../components/TravellerList'
import { EditTripModal } from '../components/EditTripModal'
import { AddTravellerModal } from '../components/AddTravellerModal'
import styles from './Overview.module.css'

const today = () => new Date().toISOString().slice(0, 10)

export function Overview() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const removeMember = useRemoveMember(trip.id)

  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)
  const canManage = me?.role === 'host'

  function handleRemove(member) {
    const name = member.profiles?.display_name ?? member.display_name ?? 'this traveller'
    if (window.confirm(`Remove ${name} from this trip?`)) removeMember.mutate(member.id)
  }

  return (
    <section>
      <div className={styles.hero}>
        <span className={styles.accent} style={{ background: trip.accent_color }} />
        <div className={styles.pad}>
          <div className={styles.ey}>
            <span>BOARDING PASS</span>
            <span className={styles.code}>{trip.code}</span>
          </div>
          {canEdit && (
            <button type="button" className={styles.edit} onClick={() => setEditing(true)}>✎ Edit</button>
          )}
          <h1 className={styles.dest}>{trip.name}</h1>
          <p className={styles.place}><span className={styles.dot} /> {trip.place}</p>
          <p className={styles.dates}>
            {monthDay(trip.start_date)} — {monthDay(trip.end_date)} · {nights(trip)} nights
          </p>
          <span className={styles.badge}>{countdownLabel(trip, today())}</span>
        </div>
      </div>

      <TransportSection trip={trip} canEdit={canEdit} memberId={me?.id ?? null} />
      <TravellerList trip={trip} canManage={canManage} onAdd={() => setAdding(true)} onRemove={handleRemove} />

      {editing && <EditTripModal trip={trip} onClose={() => setEditing(false)} />}
      {adding && <AddTravellerModal tripId={trip.id} onClose={() => setAdding(false)} />}
    </section>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/pages/Overview.test.jsx`
Expected: PASS (all — the original three tests plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Overview.jsx src/pages/Overview.test.jsx
git commit -m "feat: wire host-only add/remove travellers into Overview"
```

---

## Task 15: Full-suite check + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite + lint**

Run: `npm run test:run`
Expected: all suites PASS (existing + the new files from Tasks 2–14).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Manual smoke test (two accounts)**

With the Task 1 SQL applied and `npm run dev` running, using two Google accounts A (host) and B:

1. As A, open a trip → Overview → Travellers → **+ Add traveller** → invite B's email as editor → success; B shows as **pending** in the list.
2. As B, the bell shows a **1** badge → open it → "A invited you to … as editor" → **Accept**. The trip now appears on B's dashboard; on A's Overview B is no longer pending.
3. As A, the bell shows "B accepted your invite to …".
4. As A, **+ Add traveller** → **Add ghost** → "Grandpa Joe" → appears instantly (viewer, no account).
5. As A, remove B (✕ → confirm) → B disappears; any transport B created remains (created_by nulled).
6. Confirm A cannot remove their own (host) row — no ✕ on it.

- [ ] **Step 3: RLS spot-checks (Supabase SQL editor)**

```sql
-- A non-host cannot invite (expect: exception 'only the host can invite')
-- Run while authenticated as a viewer/editor of a trip via the app, or reason via policy:
select public.trip_role('<trip_id>');   -- should reflect the caller's role
```
Manually verify in-app: a viewer/editor sees **no** + Add traveller and **no** ✕ buttons; a direct RPC call by a non-host is rejected by the guard. A stranger cannot read another trip's members' profiles (the `profiles_select_comembers` policy only matches shared, accepted trips).

- [ ] **Step 4: Final commit (if any lint/format touch-ups were needed)**

```bash
git add -A
git commit -m "chore: #2b invitations & notifications — full-suite green + smoke-tested"
```

(If nothing changed in Steps 1–3, skip this commit.)

---

## Done — coverage against the spec

- §3 architecture (RPCs, client read-only) → Task 1 + Tasks 4–8.
- §4 `notifications` table, RLS, `profiles` broadening, FK fix, 5 RPCs → Task 1.
- §5 hooks (`useNotifications` + 5 mutations) → Tasks 3–8.
- §6 bell dropdown + `NotificationItem` + Travellers add/remove + `AddTravellerModal` → Tasks 9–14.
- §7 permissions (host-only, invitee-only) → RPC guards (Task 1) + client gating (Tasks 13–14).
- §8 edge cases (no user, duplicate, deleted trip, FK set-null, host-not-removable) → Task 1 guards + Task 12 error copy + Task 15 smoke.
- §10 testing → the test step in every task + Task 15 full-suite + RLS spot-checks.
