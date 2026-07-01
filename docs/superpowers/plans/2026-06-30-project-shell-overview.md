# Project Shell + Overview + Journey Transport (#2a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user opens a trip into its workspace (shell + tab nav), sees an Overview (trip identity, journey transport, travellers), and — as host/editor — edits the trip info and adds/edits/removes method-aware journey transport legs.

**Architecture:** A new `transport` table (RLS-guarded) is transport's single home, split by a `category` column (`journey` now, `local` in #3). `TripWorkspace` becomes the trip shell (sub-header + tabs + `<Outlet context={{trip}}>`), fetching one trip with members + transport via a `useTrip` react-query hook; child routes read the trip from Outlet context (one fetch). The Overview renders a boarding-pass hero, a grouped journey-transport section (Getting there / Getting back) with a method-aware editor modal, and a travellers list. Editing is a plain RLS-guarded `.update()` (host/editor); transport add/edit/remove are RLS-guarded insert/update/delete.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS), `react-router-dom`, `@tanstack/react-query`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-30-project-shell-overview-design.md`

**Branch:** `feat/project-shell-overview` (already created)

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/tripDates.js` (modify) | add pure `monthDay('YYYY-MM-DD')` → `'JUL 12'` formatter |
| `src/lib/transport.js` | method config (single source of truth) + `blankLeg` / `rowToForm` mappers |
| `src/lib/tripAccess.js` | `callerMember(trip, userId)` + `canWrite(role)` |
| `src/hooks/useTrip.js` | react-query read: one trip + members + transport |
| `src/hooks/useUpdateTrip.js` | mutation: edit trip name/place/dates |
| `src/hooks/useUpsertTransport.js` | mutation: insert/update a journey leg |
| `src/hooks/useDeleteTransport.js` | mutation: delete a leg |
| `src/components/EditTripModal.jsx` + `.module.css` | edit trip info (reuses `Modal`) |
| `src/components/TransportEditorModal.jsx` + `.module.css` | method-aware add/edit leg form (reuses `Modal`) |
| `src/components/TransportSection.jsx` + `.module.css` | grouped Getting-there/back list + add/edit/remove |
| `src/components/TravellerList.jsx` + `.module.css` | member avatar + name + role tag |
| `src/components/TripSubHeader.jsx` + `.module.css` | accent stripe · back · name/place/dates · code |
| `src/components/TripTabs.jsx` + `.module.css` | the five NavLink section tabs |
| `src/pages/Overview.jsx` + `.module.css` | hero + transport + travellers; owns edit modal state |
| `src/pages/ComingSoon.jsx` + `.module.css` | stub for the 4 deferred tabs |
| `src/pages/TripWorkspace.jsx` (rewrite) + `.module.css` (extend) | trip shell: sub-header + tabs + Outlet; loading/error/not-found |
| `src/App.jsx` (modify) | nested `/trip/:tripId` routes |

Reuses from #0/#1: `Modal`, `tripDates` (`countdownLabel`, `nights`), `useAuth`, `supabase`, design tokens.

---

## Task 1: Supabase backend — `transport` table, RLS, `trips` update policy + date CHECK

Runs SQL in the Supabase dashboard. No repo changes; verification is via SQL + the Task 15 smoke test.

- [ ] **Step 1: Create the table, indexes, RLS policies, grants, and the `trips` update policy**

Supabase Dashboard → SQL Editor → run:

```sql
-- Transport: one home for all transport; #2a builds category='journey' -----
create table public.transport (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  category    text not null default 'journey' check (category in ('journey','local')),
  direction   text check (direction in ('outbound','return')),
  method      text not null check (method in ('flight','train','bus','car','ferry','other')),
  depart_date date,
  depart_time time,
  from_text   text not null,
  to_text     text not null,
  reference   text,
  sort_order  int  not null default 0,
  created_by  uuid references public.trip_members(id),
  created_at  timestamptz not null default now()
);

create index on public.transport (trip_id);

alter table public.transport enable row level security;

create policy "transport_select_member" on public.transport
  for select using (public.is_trip_member(trip_id));

create policy "transport_insert_writer" on public.transport
  for insert with check (public.trip_role(trip_id) in ('host','editor'));

create policy "transport_update_writer" on public.transport
  for update using (public.trip_role(trip_id) in ('host','editor'))
            with check (public.trip_role(trip_id) in ('host','editor'));

create policy "transport_delete_writer" on public.transport
  for delete using (public.trip_role(trip_id) in ('host','editor'));

grant select, insert, update, delete on public.transport to authenticated;

-- Trips: allow host/editor edits + make the date order a DB invariant --------
alter table public.trips add constraint trips_dates_ck check (end_date >= start_date);

create policy "trips_update_writer" on public.trips
  for update using (public.trip_role(id) in ('host','editor'))
            with check (public.trip_role(id) in ('host','editor'));

grant update on public.trips to authenticated;
```

- [ ] **Step 2: Verify**

```sql
select policyname, cmd from pg_policies where tablename = 'transport' order by policyname;
```
Expected: `transport_delete_writer` (DELETE), `transport_insert_writer` (INSERT), `transport_select_member` (SELECT), `transport_update_writer` (UPDATE).

```sql
select policyname, cmd from pg_policies where tablename = 'trips' order by policyname;
```
Expected includes `trips_select_member` (SELECT, from #1) and `trips_update_writer` (UPDATE).

```sql
select conname from pg_constraint where conname = 'trips_dates_ck';
```
Expected: one row.

No commit — database only.

---

## Task 2: Shared pure helpers — `tripDates.monthDay` + `lib/transport.js`

**Files:**
- Modify: `src/lib/tripDates.js`
- Test: `src/lib/tripDates.test.js` (append)
- Create: `src/lib/transport.js`
- Test: `src/lib/transport.test.js`

- [ ] **Step 1: Append the failing test for `monthDay`** to `src/lib/tripDates.test.js`

Add these imports/cases (add `monthDay` to the existing import list at the top of the file, and append the `describe` block):

```js
import { monthDay } from './tripDates'

describe('monthDay', () => {
  it('formats YYYY-MM-DD as an uppercase month + day', () => {
    expect(monthDay('2026-07-12')).toBe('JUL 12')
    expect(monthDay('2026-01-05')).toBe('JAN 05')
  })
  it('returns empty string for a falsy date', () => {
    expect(monthDay('')).toBe('')
    expect(monthDay(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL** (`npm run test:run -- src/lib/tripDates.test.js`) — Expected: FAIL (`monthDay` is not a function).

- [ ] **Step 3: Implement `monthDay`** — append to `src/lib/tripDates.js`

```js
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export function monthDay(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${MONTHS[Number(m) - 1]} ${d}`
}
```

- [ ] **Step 4: Write the failing test** `src/lib/transport.test.js`

```js
import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_METHODS,
  METHOD_KEYS,
  methodMeta,
  blankLeg,
  rowToForm,
} from './transport'

describe('transport methods', () => {
  it('exposes a config for every method with labels and an icon', () => {
    for (const key of METHOD_KEYS) {
      const m = TRANSPORT_METHODS[key]
      expect(m.label).toBeTruthy()
      expect(m.icon).toBeTruthy()
      expect(m.from).toBeTruthy()
      expect(m.to).toBeTruthy()
    }
  })

  it('car has no reference field, flight does', () => {
    expect(TRANSPORT_METHODS.car.ref).toBeNull()
    expect(TRANSPORT_METHODS.flight.ref).toBe('Flight no.')
  })

  it('methodMeta falls back to "other" for an unknown method', () => {
    expect(methodMeta('spaceship')).toBe(TRANSPORT_METHODS.other)
    expect(methodMeta('bus')).toBe(TRANSPORT_METHODS.bus)
  })
})

describe('leg <-> form mapping', () => {
  it('blankLeg seeds direction + default date, flight by default', () => {
    expect(blankLeg('outbound', '2026-07-12')).toEqual({
      direction: 'outbound', method: 'flight', departDate: '2026-07-12',
      departTime: '', from: '', to: '', reference: '',
    })
  })

  it('rowToForm maps snake_case DB columns to the form shape', () => {
    const row = {
      id: 'l1', direction: 'return', method: 'bus',
      depart_date: '2026-07-19', depart_time: '18:30',
      from_text: 'Shinjuku', to_text: 'Kyoto', reference: 'Willer',
    }
    expect(rowToForm(row)).toEqual({
      id: 'l1', direction: 'return', method: 'bus',
      departDate: '2026-07-19', departTime: '18:30',
      from: 'Shinjuku', to: 'Kyoto', reference: 'Willer',
    })
  })

  it('rowToForm tolerates null optional columns', () => {
    const row = { id: 'l2', direction: 'outbound', method: 'car',
      depart_date: null, depart_time: null, from_text: 'A', to_text: 'B', reference: null }
    expect(rowToForm(row)).toMatchObject({ departDate: '', departTime: '', reference: '' })
  })
})
```

- [ ] **Step 5: Run, confirm FAIL** (`npm run test:run -- src/lib/transport.test.js`) — Expected: FAIL (cannot resolve `./transport`).

- [ ] **Step 6: Implement** `src/lib/transport.js`

```js
// Single source of truth for transport methods. The stored shape is constant
// (from / to / reference); only the field LABELS change per method.
export const TRANSPORT_METHODS = {
  flight: { label: 'Flight', icon: '✈', from: 'From airport', to: 'To airport', ref: 'Flight no.' },
  train:  { label: 'Train',  icon: '🚆', from: 'From station', to: 'To station', ref: 'Train / line' },
  bus:    { label: 'Bus',    icon: '🚌', from: 'From terminal', to: 'To terminal', ref: 'Operator' },
  car:    { label: 'Car',    icon: '🚗', from: 'From', to: 'To', ref: null },
  ferry:  { label: 'Ferry',  icon: '⛴', from: 'From port', to: 'To port', ref: 'Operator' },
  other:  { label: 'Other',  icon: '•', from: 'From', to: 'To', ref: 'Details' },
}

export const METHOD_KEYS = Object.keys(TRANSPORT_METHODS)

export function methodMeta(method) {
  return TRANSPORT_METHODS[method] ?? TRANSPORT_METHODS.other
}

// A fresh add-form for a direction, with the trip's default date pre-filled.
export function blankLeg(direction, defaultDate) {
  return {
    direction,
    method: 'flight',
    departDate: defaultDate ?? '',
    departTime: '',
    from: '',
    to: '',
    reference: '',
  }
}

// DB row -> edit-form shape (camelCase, no nulls).
export function rowToForm(row) {
  return {
    id: row.id,
    direction: row.direction,
    method: row.method,
    departDate: row.depart_date ?? '',
    departTime: row.depart_time ?? '',
    from: row.from_text ?? '',
    to: row.to_text ?? '',
    reference: row.reference ?? '',
  }
}
```

- [ ] **Step 7: Run, confirm PASS** (`npm run test:run -- src/lib/tripDates.test.js src/lib/transport.test.js`) — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tripDates.js src/lib/tripDates.test.js src/lib/transport.js src/lib/transport.test.js
git commit -m "feat: add monthDay formatter + transport method config and leg mappers"
```

---

## Task 3: `lib/tripAccess.js` — caller role helpers

**Files:**
- Create: `src/lib/tripAccess.js`
- Test: `src/lib/tripAccess.test.js`

- [ ] **Step 1: Write the failing test** `src/lib/tripAccess.test.js`

```js
import { describe, it, expect } from 'vitest'
import { callerMember, canWrite } from './tripAccess'

const trip = {
  trip_members: [
    { id: 'm1', user_id: 'u1', role: 'host' },
    { id: 'm2', user_id: 'u2', role: 'viewer' },
  ],
}

describe('callerMember', () => {
  it('returns the membership row for the current user', () => {
    expect(callerMember(trip, 'u1')).toEqual({ id: 'm1', user_id: 'u1', role: 'host' })
  })
  it('returns null when the user is not a member, or inputs are missing', () => {
    expect(callerMember(trip, 'nope')).toBeNull()
    expect(callerMember(null, 'u1')).toBeNull()
    expect(callerMember(trip, undefined)).toBeNull()
  })
})

describe('canWrite', () => {
  it('is true for host and editor only', () => {
    expect(canWrite('host')).toBe(true)
    expect(canWrite('editor')).toBe(true)
    expect(canWrite('viewer')).toBe(false)
    expect(canWrite(null)).toBe(false)
    expect(canWrite(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm FAIL** (`npm run test:run -- src/lib/tripAccess.test.js`).

- [ ] **Step 3: Implement** `src/lib/tripAccess.js`

```js
export function callerMember(trip, userId) {
  if (!trip || !userId) return null
  return (trip.trip_members ?? []).find((m) => m.user_id === userId) ?? null
}

export function canWrite(role) {
  return role === 'host' || role === 'editor'
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/tripAccess.js src/lib/tripAccess.test.js
git commit -m "feat: add tripAccess helpers (callerMember, canWrite)"
```

---

## Task 4: `useTrip` hook

**Files:**
- Create: `src/hooks/useTrip.js`
- Test: `src/hooks/useTrip.test.jsx`

- [ ] **Step 1: Write the failing test** `src/hooks/useTrip.test.jsx`

```jsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { maybeSingle, eq, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { maybeSingle, eq, select, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useTrip } from './useTrip'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTrip', () => {
  it('fetches one trip with members + transport', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 't1', name: 'Tokyo', trip_members: [], transport: [] }, error: null,
    })
    const { result } = renderHook(() => useTrip('t1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('trips')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('transport'))
    expect(eq).toHaveBeenCalledWith('id', 't1')
    expect(result.current.data.name).toBe('Tokyo')
  })

  it('is disabled with no tripId', () => {
    const { result } = renderHook(() => useTrip(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL** (`npm run test:run -- src/hooks/useTrip.test.jsx`).

- [ ] **Step 3: Implement** `src/hooks/useTrip.js`

```js
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

const TRIP_SELECT =
  '*, trip_members(id, user_id, display_name, role, profiles(display_name, avatar_url)), transport(*)'

export function useTrip(tripId) {
  return useQuery({
    queryKey: ['trip', tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select(TRIP_SELECT)
        .eq('id', tripId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
```

> `maybeSingle()` returns `data: null` (no error) when the row is absent or hidden by RLS,
> so a non-member / invalid id becomes a "not found" state rather than a thrown error.

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTrip.js src/hooks/useTrip.test.jsx
git commit -m "feat: add useTrip hook (one trip + members + transport)"
```

---

## Task 5: `useUpdateTrip` hook

**Files:**
- Create: `src/hooks/useUpdateTrip.js`
- Test: `src/hooks/useUpdateTrip.test.jsx`

- [ ] **Step 1: Write the failing test** `src/hooks/useUpdateTrip.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, select, eq, update, from } = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { single, select, eq, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpdateTrip } from './useUpdateTrip'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useUpdateTrip', () => {
  it('updates the trip with snake_case dates and targets the id', async () => {
    single.mockResolvedValue({ data: { id: 't1' }, error: null })
    const { result } = renderHook(() => useUpdateTrip('t1'), { wrapper })
    result.current.mutate({ name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('trips')
    expect(update).toHaveBeenCalledWith({
      name: 'Tokyo', place: 'Tokyo, Japan', start_date: '2026-07-12', end_date: '2026-07-19',
    })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })

  it('surfaces an update error', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useUpdateTrip('t1'), { wrapper })
    result.current.mutate({ name: 'x', place: 'y', startDate: '2026-07-12', endDate: '2026-07-19' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/hooks/useUpdateTrip.js`

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpdateTrip(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, place, startDate, endDate }) => {
      const { data, error } = await supabase
        .from('trips')
        .update({ name, place, start_date: startDate, end_date: endDate })
        .eq('id', tripId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUpdateTrip.js src/hooks/useUpdateTrip.test.jsx
git commit -m "feat: add useUpdateTrip mutation"
```

---

## Task 6: `useUpsertTransport` + `useDeleteTransport` hooks

**Files:**
- Create: `src/hooks/useUpsertTransport.js`, `src/hooks/useDeleteTransport.js`
- Test: `src/hooks/useUpsertTransport.test.jsx`, `src/hooks/useDeleteTransport.test.jsx`

- [ ] **Step 1: Write the failing test** `src/hooks/useUpsertTransport.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, select, eq, insert, update, from } = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const insert = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, update }))
  return { single, select, eq, insert, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpsertTransport } from './useUpsertTransport'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

const leg = {
  direction: 'outbound', method: 'flight', departDate: '2026-07-12', departTime: '14:00',
  from: 'KLIA2', to: 'Haneda', reference: 'JL723', createdBy: 'm1',
}

describe('useUpsertTransport', () => {
  it('inserts a new leg (no id) with mapped columns + created_by', async () => {
    single.mockResolvedValue({ data: { id: 'n1' }, error: null })
    const { result } = renderHook(() => useUpsertTransport('t1'), { wrapper })
    result.current.mutate(leg)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('transport')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      trip_id: 't1', category: 'journey', direction: 'outbound', method: 'flight',
      depart_date: '2026-07-12', depart_time: '14:00',
      from_text: 'KLIA2', to_text: 'Haneda', reference: 'JL723', created_by: 'm1',
    }))
  })

  it('updates an existing leg (with id) and does not clobber created_by', async () => {
    single.mockResolvedValue({ data: { id: 'x1' }, error: null })
    const { result } = renderHook(() => useUpsertTransport('t1'), { wrapper })
    result.current.mutate({ ...leg, id: 'x1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ from_text: 'KLIA2', to_text: 'Haneda' }))
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ created_by: expect.anything() }))
    expect(eq).toHaveBeenCalledWith('id', 'x1')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL** (`npm run test:run -- src/hooks/useUpsertTransport.test.jsx`).

- [ ] **Step 3: Implement** `src/hooks/useUpsertTransport.js`

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertTransport(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (leg) => {
      const row = {
        trip_id: tripId,
        category: 'journey',
        direction: leg.direction,
        method: leg.method,
        depart_date: leg.departDate || null,
        depart_time: leg.departTime || null,
        from_text: leg.from,
        to_text: leg.to,
        reference: leg.reference || null,
      }
      const query = leg.id
        ? supabase.from('transport').update(row).eq('id', leg.id)
        : supabase.from('transport').insert({ ...row, created_by: leg.createdBy ?? null })
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Write the failing test** `src/hooks/useDeleteTransport.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn(() => Promise.resolve({ error: null }))
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useDeleteTransport } from './useDeleteTransport'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useDeleteTransport', () => {
  it('deletes the leg by id', async () => {
    const { result } = renderHook(() => useDeleteTransport('t1'), { wrapper })
    result.current.mutate('x1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('transport')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'x1')
  })
})
```

- [ ] **Step 6: Run, confirm FAIL.**

- [ ] **Step 7: Implement** `src/hooks/useDeleteTransport.js`

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useDeleteTransport(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('transport').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 8: Run, confirm PASS** (`npm run test:run -- src/hooks/useDeleteTransport.test.jsx`).

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useUpsertTransport.js src/hooks/useUpsertTransport.test.jsx src/hooks/useDeleteTransport.js src/hooks/useDeleteTransport.test.jsx
git commit -m "feat: add useUpsertTransport + useDeleteTransport mutations"
```

---

## Task 7: `EditTripModal`

Mounted only while editing (fresh state each open). Mirrors `CreateTripModal`'s validation.

**Files:**
- Create: `src/components/EditTripModal.jsx`, `src/components/EditTripModal.module.css`
- Test: `src/components/EditTripModal.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/EditTripModal.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpdateTrip', () => ({ useUpdateTrip: vi.fn() }))
import { useUpdateTrip } from '../hooks/useUpdateTrip'
import { EditTripModal } from './EditTripModal'

const trip = { name: 'Tokyo', place: 'Tokyo, Japan', start_date: '2026-07-12', end_date: '2026-07-19' }

beforeEach(() => vi.clearAllMocks())

function setup(mutate = vi.fn()) {
  useUpdateTrip.mockReturnValue({ mutate, isPending: false })
  render(<EditTripModal onClose={vi.fn()} trip={trip} />)
  return mutate
}

describe('EditTripModal', () => {
  it('pre-fills the form from the trip', () => {
    setup()
    expect(screen.getByLabelText(/trip name/i)).toHaveValue('Tokyo')
    expect(screen.getByLabelText(/place/i)).toHaveValue('Tokyo, Japan')
    expect(screen.getByLabelText(/start/i)).toHaveValue('2026-07-12')
  })

  it('blocks an empty name', async () => {
    const mutate = setup()
    fireEvent.change(screen.getByLabelText(/trip name/i), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/all fields are required/i)).toBeInTheDocument()
  })

  it('blocks end before start', async () => {
    const mutate = setup()
    fireEvent.change(screen.getByLabelText(/end/i), { target: { value: '2026-07-01' } })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument()
  })

  it('submits mapped values', async () => {
    const mutate = setup()
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(
      { name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' },
      expect.any(Object),
    )
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/EditTripModal.jsx`

```jsx
import { useState } from 'react'
import { Modal } from './Modal'
import { useUpdateTrip } from '../hooks/useUpdateTrip'
import styles from './EditTripModal.module.css'

export function EditTripModal({ onClose, trip }) {
  const [form, setForm] = useState({
    name: trip.name, place: trip.place, startDate: trip.start_date, endDate: trip.end_date,
  })
  const [error, setError] = useState('')
  const { mutate, isPending } = useUpdateTrip(trip.id)

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const { name, place, startDate, endDate } = form
    if (!name.trim() || !place.trim() || !startDate || !endDate) {
      setError('All fields are required.')
      return
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.')
      return
    }
    setError('')
    mutate(
      { name: name.trim(), place: place.trim(), startDate, endDate },
      { onSuccess: onClose, onError: () => setError('Could not save changes. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Edit trip">
      <form className={styles.pass} onSubmit={handleSubmit}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>EDIT BOARDING PASS</p>
          <h2 className={styles.title}>Trip details</h2>

          <label className={styles.label} htmlFor="e-name">Trip name</label>
          <input id="e-name" className={styles.input} value={form.name} onChange={set('name')} autoFocus />

          <label className={styles.label} htmlFor="e-place">Place</label>
          <input id="e-place" className={styles.input} value={form.place} onChange={set('place')} />

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="e-start">Start date</label>
              <input id="e-start" type="date" className={styles.input} value={form.startDate} onChange={set('startDate')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="e-end">End date</label>
              <input id="e-end" type="date" className={styles.input} value={form.endDate} onChange={set('endDate')} />
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Implement** `src/components/EditTripModal.module.css`

```css
.pass { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.colbar { height: 7px; background: var(--primary); }
.pad { padding: var(--space-6); }
.ey { font-size: 11px; letter-spacing: 0.05em; color: var(--ink-muted); font-weight: 700; }
.title { margin: 6px 0 var(--space-5); font-size: 24px; }
.label { display: block; margin: var(--space-3) 0 var(--space-1); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
.input { width: 100%; padding: var(--space-3); font-family: var(--font-body); font-size: 15px; color: var(--ink); background: var(--c-mist); border: 1.5px solid var(--border); border-radius: var(--radius-md); }
.input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18); }
.row { display: flex; gap: var(--space-3); }
.col { flex: 1; }
.error { margin-top: var(--space-3); color: var(--c-danger); font-size: 13px; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
.cancel { padding: var(--space-3) var(--space-4); font-weight: 600; color: var(--ink-muted); background: transparent; border: 1.5px solid var(--border); border-radius: var(--radius-md); }
.submit { padding: var(--space-3) var(--space-5); font-weight: 700; color: #fff; background: var(--accent); border: none; border-radius: var(--radius-md); }
.submit:disabled { opacity: 0.6; cursor: not-allowed; }
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/EditTripModal.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/EditTripModal.jsx src/components/EditTripModal.module.css src/components/EditTripModal.test.jsx
git commit -m "feat: add EditTripModal (edit trip info)"
```

---

## Task 8: `TransportEditorModal` (method-aware)

**Files:**
- Create: `src/components/TransportEditorModal.jsx`, `src/components/TransportEditorModal.module.css`
- Test: `src/components/TransportEditorModal.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/TransportEditorModal.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpsertTransport', () => ({ useUpsertTransport: vi.fn() }))
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import { TransportEditorModal } from './TransportEditorModal'

const initial = {
  direction: 'outbound', method: 'flight', departDate: '2026-07-12', departTime: '',
  from: '', to: '', reference: '',
}

beforeEach(() => vi.clearAllMocks())

function setup(mutate = vi.fn(), init = initial) {
  useUpsertTransport.mockReturnValue({ mutate, isPending: false })
  render(<TransportEditorModal onClose={vi.fn()} tripId="t1" initial={init} createdBy="m1" />)
  return mutate
}

describe('TransportEditorModal', () => {
  it('labels the fields for the flight method', () => {
    setup()
    expect(screen.getByLabelText(/from airport/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/to airport/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/flight no/i)).toBeInTheDocument()
  })

  it('relabels the fields when the method changes to bus', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /bus/i }))
    expect(screen.getByLabelText(/from terminal/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/operator/i)).toBeInTheDocument()
  })

  it('hides the reference field for car', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /car/i }))
    expect(screen.queryByLabelText(/flight no/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/operator/i)).not.toBeInTheDocument()
  })

  it('blocks save when from/to are empty', async () => {
    const mutate = setup()
    await userEvent.click(screen.getByRole('button', { name: /save leg/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/from and to are required/i)).toBeInTheDocument()
  })

  it('submits the leg with createdBy', async () => {
    const mutate = setup()
    fireEvent.change(screen.getByLabelText(/from airport/i), { target: { value: 'KLIA2' } })
    fireEvent.change(screen.getByLabelText(/to airport/i), { target: { value: 'Haneda' } })
    await userEvent.click(screen.getByRole('button', { name: /save leg/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'outbound', method: 'flight', from: 'KLIA2', to: 'Haneda', createdBy: 'm1' }),
      expect.any(Object),
    )
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/TransportEditorModal.jsx`

```jsx
import { useState } from 'react'
import { Modal } from './Modal'
import { TRANSPORT_METHODS, METHOD_KEYS, methodMeta } from '../lib/transport'
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import styles from './TransportEditorModal.module.css'

const DIRECTIONS = [
  { key: 'outbound', label: 'Outbound' },
  { key: 'return', label: 'Return' },
]

export function TransportEditorModal({ onClose, tripId, initial, createdBy }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const { mutate, isPending } = useUpsertTransport(tripId)
  const meta = methodMeta(form.method)
  const isEdit = !!form.id

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.method || !form.from.trim() || !form.to.trim()) {
      setError('Method, from and to are required.')
      return
    }
    setError('')
    mutate(
      { ...form, from: form.from.trim(), to: form.to.trim(), reference: form.reference.trim(), createdBy },
      { onSuccess: onClose, onError: () => setError('Could not save this leg. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit transport' : 'Add transport'}>
      <form className={styles.pass} onSubmit={handleSubmit}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>{isEdit ? 'EDIT LEG' : 'NEW LEG'}</p>
          <h2 className={styles.title}>{form.direction === 'return' ? 'Getting back' : 'Getting there'}</h2>

          <span className={styles.label} id="dir-label">Direction</span>
          <div className={styles.toggle} role="group" aria-labelledby="dir-label">
            {DIRECTIONS.map((d) => (
              <button key={d.key} type="button"
                className={`${styles.toggleBtn} ${form.direction === d.key ? styles.toggleOn : ''}`}
                aria-pressed={form.direction === d.key}
                onClick={() => setForm((f) => ({ ...f, direction: d.key }))}>
                {d.label}
              </button>
            ))}
          </div>

          <span className={styles.label} id="method-label">Method</span>
          <div className={styles.chips} role="group" aria-labelledby="method-label">
            {METHOD_KEYS.map((k) => (
              <button key={k} type="button"
                className={`${styles.chip} ${form.method === k ? styles.chipOn : ''}`}
                aria-pressed={form.method === k}
                onClick={() => setForm((f) => ({ ...f, method: k }))}>
                <span aria-hidden="true">{TRANSPORT_METHODS[k].icon}</span> {TRANSPORT_METHODS[k].label}
              </button>
            ))}
          </div>

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-date">Depart date</label>
              <input id="tr-date" type="date" className={styles.input} value={form.departDate} onChange={set('departDate')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-time">Depart time · optional</label>
              <input id="tr-time" type="time" className={styles.input} value={form.departTime} onChange={set('departTime')} />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-from">{meta.from}</label>
              <input id="tr-from" className={styles.input} value={form.from} onChange={set('from')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="tr-to">{meta.to}</label>
              <input id="tr-to" className={styles.input} value={form.to} onChange={set('to')} />
            </div>
          </div>

          {meta.ref && (
            <>
              <label className={styles.label} htmlFor="tr-ref">{meta.ref} · optional</label>
              <input id="tr-ref" className={styles.input} value={form.reference} onChange={set('reference')} />
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save leg'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Implement** `src/components/TransportEditorModal.module.css`

```css
.pass { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.colbar { height: 7px; background: var(--primary); }
.pad { padding: var(--space-6); }
.ey { font-size: 11px; letter-spacing: 0.05em; color: var(--ink-muted); font-weight: 700; }
.title { margin: 6px 0 var(--space-4); font-size: 22px; }
.label { display: block; margin: var(--space-3) 0 var(--space-1); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
.toggle { display: inline-flex; border: 1.5px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.toggleBtn { padding: var(--space-2) var(--space-5); font-size: 14px; font-weight: 600; color: var(--ink-muted); background: var(--surface); border: none; }
.toggleOn { background: var(--primary); color: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { padding: var(--space-2) var(--space-3); font-size: 13px; font-weight: 600; color: var(--ink-muted); background: var(--surface); border: 1.5px solid var(--border); border-radius: 999px; }
.chipOn { background: var(--primary); color: #fff; border-color: var(--primary); }
.input { width: 100%; padding: var(--space-3); font-family: var(--font-body); font-size: 15px; color: var(--ink); background: var(--c-mist); border: 1.5px solid var(--border); border-radius: var(--radius-md); box-sizing: border-box; }
.input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18); }
.row { display: flex; gap: var(--space-3); }
.col { flex: 1; }
.error { margin-top: var(--space-3); color: var(--c-danger); font-size: 13px; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
.cancel { padding: var(--space-3) var(--space-4); font-weight: 600; color: var(--ink-muted); background: transparent; border: 1.5px solid var(--border); border-radius: var(--radius-md); }
.submit { padding: var(--space-3) var(--space-5); font-weight: 700; color: #fff; background: var(--accent); border: none; border-radius: var(--radius-md); }
.submit:disabled { opacity: 0.6; cursor: not-allowed; }
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/TransportEditorModal.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/TransportEditorModal.jsx src/components/TransportEditorModal.module.css src/components/TransportEditorModal.test.jsx
git commit -m "feat: add method-aware TransportEditorModal"
```

---

## Task 9: `TransportSection` (grouped list + add/edit/remove)

**Files:**
- Create: `src/components/TransportSection.jsx`, `src/components/TransportSection.module.css`
- Test: `src/components/TransportSection.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/TransportSection.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./TransportEditorModal', () => ({
  TransportEditorModal: ({ initial }) => <div>Editor:{initial.direction}</div>,
}))
const del = vi.fn()
vi.mock('../hooks/useDeleteTransport', () => ({ useDeleteTransport: () => ({ mutate: del }) }))

import { TransportSection } from './TransportSection'

const outbound = {
  id: 'l1', category: 'journey', direction: 'outbound', method: 'flight',
  depart_date: '2026-07-12', depart_time: '14:00', from_text: 'KLIA2', to_text: 'Haneda', reference: 'JL723',
}
const ret = { ...outbound, id: 'l2', direction: 'return', from_text: 'Haneda', to_text: 'KLIA2' }
const trip = (transport) => ({ id: 't1', start_date: '2026-07-12', end_date: '2026-07-19', transport })

beforeEach(() => vi.clearAllMocks())

describe('TransportSection', () => {
  it('renders both groups with legs and metadata', () => {
    render(<TransportSection trip={trip([outbound, ret])} canEdit={false} memberId="m1" />)
    expect(screen.getByText(/getting there/i)).toBeInTheDocument()
    expect(screen.getByText(/getting back/i)).toBeInTheDocument()
    expect(screen.getByText('KLIA2 → Haneda')).toBeInTheDocument()
    expect(screen.getByText(/JUL 12/)).toBeInTheDocument()
  })

  it('hides add/edit/remove controls when canEdit is false', () => {
    render(<TransportSection trip={trip([outbound])} canEdit={false} memberId="m1" />)
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('shows an add prompt for an empty group and opens the editor', async () => {
    render(<TransportSection trip={trip([outbound])} canEdit memberId="m1" />)
    expect(screen.getByText(/add your return transport/i)).toBeInTheDocument()
    const addButtons = screen.getAllByRole('button', { name: /add/i })
    await userEvent.click(addButtons[0])
    expect(screen.getByText('Editor:outbound')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/TransportSection.jsx`

```jsx
import { useState } from 'react'
import { monthDay } from '../lib/tripDates'
import { blankLeg, rowToForm, methodMeta } from '../lib/transport'
import { TransportEditorModal } from './TransportEditorModal'
import { useDeleteTransport } from '../hooks/useDeleteTransport'
import styles from './TransportSection.module.css'

const GROUPS = [
  { direction: 'outbound', label: 'Getting there', icon: '🌍', empty: 'Add your outbound transport' },
  { direction: 'return', label: 'Getting back', icon: '🏠', empty: 'Add your return transport' },
]

function sortLegs(a, b) {
  return (
    (a.depart_date ?? '').localeCompare(b.depart_date ?? '') ||
    (a.depart_time ?? '').localeCompare(b.depart_time ?? '') ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '')
  )
}

function legMeta(leg) {
  return [monthDay(leg.depart_date), leg.depart_time, methodMeta(leg.method).label, leg.reference]
    .filter(Boolean)
    .join(' · ')
}

export function TransportSection({ trip, canEdit, memberId }) {
  const [editor, setEditor] = useState(null)
  const del = useDeleteTransport(trip.id)
  const legs = (trip.transport ?? []).filter((t) => t.category === 'journey')

  function defaultDate(direction) {
    return direction === 'return' ? trip.end_date : trip.start_date
  }
  function remove(leg) {
    if (window.confirm('Remove this transport leg?')) del.mutate(leg.id)
  }

  return (
    <section className={styles.wrap}>
      <h2 className={styles.h2}>Transport</h2>
      {GROUPS.map((g) => {
        const items = legs.filter((l) => l.direction === g.direction).slice().sort(sortLegs)
        return (
          <div key={g.direction} className={styles.group}>
            <div className={styles.head}>
              <span className={styles.title}>
                <span aria-hidden="true">{g.icon}</span> {g.label}
              </span>
              {canEdit && (
                <button type="button" className={styles.add}
                  onClick={() => setEditor({ initial: blankLeg(g.direction, defaultDate(g.direction)) })}>
                  + Add
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className={styles.empty}>{canEdit ? g.empty : 'No transport yet'}</p>
            ) : (
              <ul className={styles.list}>
                {items.map((l) => (
                  <li key={l.id} className={styles.leg}>
                    <span className={styles.icon} aria-hidden="true">{methodMeta(l.method).icon}</span>
                    <div className={styles.main}>
                      <p className={styles.route}>{l.from_text} → {l.to_text}</p>
                      <p className={styles.meta}>{legMeta(l)}</p>
                    </div>
                    {canEdit && (
                      <div className={styles.act}>
                        <button type="button" className={styles.iconBtn}
                          aria-label={`Edit ${l.from_text} to ${l.to_text}`}
                          onClick={() => setEditor({ initial: rowToForm(l) })}>✎</button>
                        <button type="button" className={styles.iconBtn}
                          aria-label={`Remove ${l.from_text} to ${l.to_text}`}
                          onClick={() => remove(l)}>✕</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {editor && (
        <TransportEditorModal
          tripId={trip.id}
          initial={editor.initial}
          createdBy={memberId}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 4: Implement** `src/components/TransportSection.module.css`

```css
.wrap { margin-top: var(--space-6); }
.h2 { font-size: 18px; margin-bottom: var(--space-4); }
.group { margin-bottom: var(--space-5); }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.title { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-muted); }
.add { font-size: 12px; font-weight: 700; color: var(--primary-strong); background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-1) var(--space-3); }
.add:hover { border-color: var(--primary); }
.empty { padding: var(--space-4); text-align: center; color: var(--ink-muted); font-size: 14px; background: var(--surface); border: 1.5px dashed var(--border); border-radius: var(--radius-md); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.leg { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
.icon { display: grid; place-items: center; width: 32px; height: 32px; flex: none; font-size: 16px; background: var(--c-mist); border-radius: var(--radius-sm); }
.main { flex: 1; min-width: 0; }
.route { font-size: 15px; font-weight: 700; color: var(--ink); }
.meta { margin-top: 2px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-muted); }
.act { display: flex; gap: var(--space-1); flex: none; }
.iconBtn { width: 28px; height: 28px; color: var(--ink-muted); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); }
.iconBtn:hover { color: var(--primary-strong); background: var(--c-mist); }
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/TransportSection.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/TransportSection.jsx src/components/TransportSection.module.css src/components/TransportSection.test.jsx
git commit -m "feat: add grouped TransportSection with add/edit/remove"
```

---

## Task 10: `TravellerList`

**Files:**
- Create: `src/components/TravellerList.jsx`, `src/components/TravellerList.module.css`
- Test: `src/components/TravellerList.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/TravellerList.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TravellerList } from './TravellerList'

const trip = (members) => ({ accent_color: '#0EA5E9', trip_members: members })

describe('TravellerList', () => {
  it('renders a single traveller with name and role', () => {
    render(<TravellerList trip={trip([
      { id: 'm1', role: 'host', display_name: null, profiles: { display_name: 'Ana' } },
    ])} />)
    expect(screen.getByText('1 Traveller')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('pluralises and falls back to ghost display_name', () => {
    render(<TravellerList trip={trip([
      { id: 'm1', role: 'host', profiles: { display_name: 'Ana' } },
      { id: 'm2', role: 'viewer', display_name: 'Ben (guest)', profiles: null },
    ])} />)
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
    expect(screen.getByText('Ben (guest)')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/TravellerList.jsx`

```jsx
import styles from './TravellerList.module.css'

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export function TravellerList({ trip }) {
  const members = trip.trip_members ?? []
  return (
    <section className={styles.wrap}>
      <h2 className={styles.h2}>
        {members.length} {members.length === 1 ? 'Traveller' : 'Travellers'}
      </h2>
      <ul className={styles.list}>
        {members.map((m) => {
          const name = m.profiles?.display_name ?? m.display_name ?? 'Guest'
          return (
            <li key={m.id} className={styles.row}>
              <span className={styles.av} style={{ background: trip.accent_color }}>{initials(name)}</span>
              <span className={styles.name}>{name}</span>
              <span className={`${styles.tag} ${m.role === 'host' ? styles.host : ''}`}>{m.role}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Implement** `src/components/TravellerList.module.css`

```css
.wrap { margin-top: var(--space-6); }
.h2 { font-size: 18px; margin-bottom: var(--space-4); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.av { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 50%; border: 2px solid #fff; color: #fff; font-size: 13px; font-weight: 700; }
.name { flex: 1; font-size: 15px; color: var(--ink); }
.tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-muted); }
.host { color: var(--accent); }
```

- [ ] **Step 5: Run, confirm PASS.**

- [ ] **Step 6: Commit**

```bash
git add src/components/TravellerList.jsx src/components/TravellerList.module.css src/components/TravellerList.test.jsx
git commit -m "feat: add TravellerList"
```

---

## Task 11: `TripSubHeader` + `TripTabs`

**Files:**
- Create: `src/components/TripSubHeader.jsx`, `src/components/TripSubHeader.module.css`, `src/components/TripTabs.jsx`, `src/components/TripTabs.module.css`
- Test: `src/components/TripSubHeader.test.jsx`, `src/components/TripTabs.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/TripSubHeader.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripSubHeader } from './TripSubHeader'

const trip = {
  name: 'Tokyo Trip', place: 'Tokyo, Japan', code: 'TRIP·07',
  start_date: '2026-07-12', end_date: '2026-07-19', accent_color: '#0EA5E9',
}

describe('TripSubHeader', () => {
  it('renders the trip identity and a back link', () => {
    render(<MemoryRouter><TripSubHeader trip={trip} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /tokyo trip/i })).toBeInTheDocument()
    expect(screen.getByText(/tokyo, japan/i)).toBeInTheDocument()
    expect(screen.getByText('TRIP·07')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /trips/i })).toHaveAttribute('href', '/')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/TripSubHeader.jsx`

```jsx
import { Link } from 'react-router-dom'
import { nights, monthDay } from '../lib/tripDates'
import styles from './TripSubHeader.module.css'

export function TripSubHeader({ trip }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.accent} style={{ background: trip.accent_color }} />
      <div className={styles.bar}>
        <Link to="/" className={styles.back}>← Trips</Link>
        <div className={styles.info}>
          <h1 className={styles.name}>{trip.name}</h1>
          <p className={styles.meta}>
            <span className={styles.dot} /> {trip.place} · {monthDay(trip.start_date)} — {monthDay(trip.end_date)} · {nights(trip)} nights
          </p>
        </div>
        <span className={styles.code}>{trip.code}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement** `src/components/TripSubHeader.module.css`

```css
.wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
.accent { display: block; height: 6px; }
.bar { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); }
.back { flex: none; font-size: 14px; font-weight: 600; color: var(--primary-strong); text-decoration: none; }
.back:hover { text-decoration: underline; }
.info { flex: 1; min-width: 0; }
.name { font-size: 22px; }
.meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 13px; color: var(--ink-muted); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.code { flex: none; font-family: var(--font-mono); font-size: 12px; color: var(--primary-strong); background: var(--c-mist); padding: 3px 8px; border-radius: var(--radius-sm); }
```

- [ ] **Step 5: Write the failing test** `src/components/TripTabs.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripTabs } from './TripTabs'

describe('TripTabs', () => {
  it('renders all five section tabs', () => {
    render(<MemoryRouter initialEntries={['/trip/t1/overview']}><TripTabs /></MemoryRouter>)
    for (const name of ['Overview', 'Planning', 'Packing', 'Finance', 'Discussion']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 6: Run, confirm FAIL.**

- [ ] **Step 7: Implement** `src/components/TripTabs.jsx`

```jsx
import { NavLink } from 'react-router-dom'
import styles from './TripTabs.module.css'

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'planning', label: 'Planning' },
  { to: 'packing', label: 'Packing' },
  { to: 'finance', label: 'Finance' },
  { to: 'discussion', label: 'Discussion' },
]

export function TripTabs() {
  return (
    <nav className={styles.tabs} aria-label="Trip sections">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 8: Implement** `src/components/TripTabs.module.css`

```css
.tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-4) 0; }
.tab { padding: var(--space-2) var(--space-4); font-size: 14px; font-weight: 600; color: var(--ink-muted); text-decoration: none; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease); }
.tab:hover { color: var(--primary-strong); }
.active { color: #fff; background: var(--primary); border-color: var(--primary); }
```

- [ ] **Step 9: Run, confirm PASS** (`npm run test:run -- src/components/TripSubHeader.test.jsx src/components/TripTabs.test.jsx`).

- [ ] **Step 10: Commit**

```bash
git add src/components/TripSubHeader.jsx src/components/TripSubHeader.module.css src/components/TripSubHeader.test.jsx src/components/TripTabs.jsx src/components/TripTabs.module.css src/components/TripTabs.test.jsx
git commit -m "feat: add TripSubHeader and TripTabs shell pieces"
```

---

## Task 12: `ComingSoon` stub

**Files:**
- Create: `src/pages/ComingSoon.jsx`, `src/pages/ComingSoon.module.css`
- Test: `src/pages/ComingSoon.test.jsx`

- [ ] **Step 1: Write the failing test** `src/pages/ComingSoon.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  it('names the section that is coming soon', () => {
    render(<ComingSoon section="Planning" />)
    expect(screen.getByText(/planning is coming soon/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/pages/ComingSoon.jsx`

```jsx
import styles from './ComingSoon.module.css'

export function ComingSoon({ section }) {
  return (
    <section className={styles.wrap}>
      <span className={styles.badge} aria-hidden="true">🚧</span>
      <h2 className={styles.title}>{section} is coming soon</h2>
      <p className={styles.text}>This section lands in a later update. For now, head back to the Overview.</p>
    </section>
  )
}
```

- [ ] **Step 4: Implement** `src/pages/ComingSoon.module.css`

```css
.wrap { display: grid; justify-items: center; text-align: center; gap: var(--space-3); padding: var(--space-8) var(--space-5); background: var(--surface); border: 2px dashed var(--border); border-radius: var(--radius-lg); }
.badge { display: grid; place-items: center; width: 56px; height: 56px; font-size: 26px; background: var(--c-mist); border-radius: 50%; }
.title { font-size: 20px; }
.text { max-width: 40ch; color: var(--ink-muted); }
```

- [ ] **Step 5: Run, confirm PASS.**

- [ ] **Step 6: Commit**

```bash
git add src/pages/ComingSoon.jsx src/pages/ComingSoon.module.css src/pages/ComingSoon.test.jsx
git commit -m "feat: add ComingSoon stub for deferred tabs"
```

---

## Task 13: `Overview` page

Reads the trip from Outlet context, derives edit permission, and composes the hero +
transport section + travellers + edit modal.

**Files:**
- Create: `src/pages/Overview.jsx`, `src/pages/Overview.module.css`
- Test: `src/pages/Overview.test.jsx`

- [ ] **Step 1: Write the failing test** `src/pages/Overview.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../components/TransportSection', () => ({ TransportSection: () => <div>TransportSection</div> }))
vi.mock('../components/TravellerList', () => ({ TravellerList: () => <div>TravellerList</div> }))
vi.mock('../components/EditTripModal', () => ({ EditTripModal: () => <div>EditTripModal</div> }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { Overview } from './Overview'

const trip = {
  id: 't1', name: 'Tokyo Trip', place: 'Tokyo, Japan', code: 'TRIP·07',
  start_date: '2026-07-12', end_date: '2026-07-19', accent_color: '#0EA5E9',
  trip_members: [{ id: 'm1', user_id: 'u1', role: 'host', profiles: { display_name: 'Ana' } }],
  transport: [],
}

function renderOverview(t = trip) {
  return render(
    <MemoryRouter initialEntries={['/trip/t1/overview']}>
      <Routes>
        <Route path="/trip/:tripId" element={<Outlet context={{ trip: t }} />}>
          <Route path="overview" element={<Overview />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Overview', () => {
  it('renders the trip identity and sub-sections', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview()
    expect(screen.getByRole('heading', { name: /tokyo trip/i })).toBeInTheDocument()
    expect(screen.getByText('TransportSection')).toBeInTheDocument()
    expect(screen.getByText('TravellerList')).toBeInTheDocument()
  })

  it('shows Edit for a host and opens the edit modal', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview()
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText('EditTripModal')).toBeInTheDocument()
  })

  it('hides Edit for a non-writer', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderOverview({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/pages/Overview.jsx`

```jsx
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { countdownLabel, nights, monthDay } from '../lib/tripDates'
import { TransportSection } from '../components/TransportSection'
import { TravellerList } from '../components/TravellerList'
import { EditTripModal } from '../components/EditTripModal'
import styles from './Overview.module.css'

const today = () => new Date().toISOString().slice(0, 10)

export function Overview() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)

  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)

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
      <TravellerList trip={trip} />

      {editing && <EditTripModal trip={trip} onClose={() => setEditing(false)} />}
    </section>
  )
}
```

- [ ] **Step 4: Implement** `src/pages/Overview.module.css`

```css
.hero { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
.accent { display: block; height: 7px; }
.pad { padding: var(--space-5); }
.ey { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--ink-muted); }
.code { font-family: var(--font-mono); font-size: 11px; color: var(--primary-strong); background: var(--c-mist); padding: 2px 7px; border-radius: 6px; }
.edit { position: absolute; top: var(--space-5); right: var(--space-5); font-size: 12px; font-weight: 600; color: var(--primary-strong); background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-1) var(--space-3); }
.edit:hover { border-color: var(--primary); }
.dest { margin: var(--space-3) 0 2px; font-size: 28px; }
.place { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--ink-muted); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.dates { margin: var(--space-3) 0; font-family: var(--font-mono); font-size: 13px; color: var(--ink); }
.badge { display: inline-block; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #fff; background: var(--accent); border-radius: 999px; }
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/pages/Overview.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Overview.jsx src/pages/Overview.module.css src/pages/Overview.test.jsx
git commit -m "feat: add Overview page (hero + transport + travellers + edit)"
```

---

## Task 14: `TripWorkspace` rewrite + router wiring

**Files:**
- Rewrite: `src/pages/TripWorkspace.jsx`
- Extend: `src/pages/TripWorkspace.module.css`
- Modify: `src/App.jsx`
- Test: `src/pages/TripWorkspace.test.jsx`

- [ ] **Step 1: Write the failing test** `src/pages/TripWorkspace.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

vi.mock('../hooks/useTrip', () => ({ useTrip: vi.fn() }))
vi.mock('../components/TripSubHeader', () => ({ TripSubHeader: () => <div>SubHeader</div> }))
vi.mock('../components/TripTabs', () => ({ TripTabs: () => <div>Tabs</div> }))

import { useTrip } from '../hooks/useTrip'
import { TripWorkspace } from './TripWorkspace'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trip/:tripId" element={<TripWorkspace />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<div>Overview Page</div>} />
        </Route>
        <Route path="/" element={<div>Trips Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('TripWorkspace', () => {
  it('shows a loading state', () => {
    useTrip.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderAt('/trip/t1/overview')
    expect(screen.getByText(/loading trip/i)).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    useTrip.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() })
    renderAt('/trip/t1/overview')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows a not-found state when the trip is missing / no access', () => {
    useTrip.mockReturnValue({ data: null, isLoading: false, isError: false })
    renderAt('/trip/t1/overview')
    expect(screen.getByText(/trip not found/i)).toBeInTheDocument()
  })

  it('renders the shell + outlet when loaded', () => {
    useTrip.mockReturnValue({ data: { id: 't1', name: 'Tokyo' }, isLoading: false, isError: false })
    renderAt('/trip/t1/overview')
    expect(screen.getByText('SubHeader')).toBeInTheDocument()
    expect(screen.getByText('Tabs')).toBeInTheDocument()
    expect(screen.getByText('Overview Page')).toBeInTheDocument()
  })

  it('redirects the index route to overview', () => {
    useTrip.mockReturnValue({ data: { id: 't1', name: 'Tokyo' }, isLoading: false, isError: false })
    renderAt('/trip/t1')
    expect(screen.getByText('Overview Page')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Rewrite** `src/pages/TripWorkspace.jsx`

```jsx
import { Outlet, useParams, Link } from 'react-router-dom'
import { useTrip } from '../hooks/useTrip'
import { TripSubHeader } from '../components/TripSubHeader'
import { TripTabs } from '../components/TripTabs'
import styles from './TripWorkspace.module.css'

export function TripWorkspace() {
  const { tripId } = useParams()
  const { data: trip, isLoading, isError, refetch } = useTrip(tripId)

  if (isLoading) return <p className={styles.muted}>Loading trip…</p>

  if (isError) {
    return (
      <div role="alert" className={styles.error}>
        <p>We couldn&apos;t load this trip. Check your connection and try again.</p>
        <button type="button" onClick={() => refetch()}>Try again</button>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className={styles.notfound}>
        <h1 className={styles.nfTitle}>Trip not found</h1>
        <p className={styles.nfText}>This trip doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link to="/" className={styles.back}>← Back to trips</Link>
      </div>
    )
  }

  return (
    <div className={styles.workspace}>
      <TripSubHeader trip={trip} />
      <TripTabs />
      <div className={styles.body}>
        <Outlet context={{ trip }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace** `src/pages/TripWorkspace.module.css` (the placeholder styles are no longer used)

```css
.workspace { display: block; }
.body { margin-top: var(--space-2); }
.muted { color: var(--ink-muted); }
.error { display: grid; gap: var(--space-3); justify-items: start; padding: var(--space-5); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.error button { padding: var(--space-2) var(--space-4); font-weight: 600; color: var(--primary-strong); background: transparent; border: 1.5px solid var(--border); border-radius: var(--radius-md); }
.notfound { display: grid; justify-items: center; text-align: center; gap: var(--space-3); padding: var(--space-8) var(--space-5); background: var(--surface); border: 2px dashed var(--border); border-radius: var(--radius-lg); }
.nfTitle { font-size: 24px; }
.nfText { max-width: 40ch; color: var(--ink-muted); }
.back { font-size: 14px; font-weight: 600; color: var(--primary-strong); text-decoration: none; }
.back:hover { text-decoration: underline; }
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/pages/TripWorkspace.test.jsx`).

- [ ] **Step 6: Wire the nested routes in** `src/App.jsx`

Replace the single trip route line:

```jsx
<Route path="/trip/:tripId" element={<TripWorkspace />} />
```

with the nested block, and add the imports (`Navigate` from `react-router-dom`, plus `Overview` and `ComingSoon`):

```jsx
<Route path="/trip/:tripId" element={<TripWorkspace />}>
  <Route index element={<Navigate to="overview" replace />} />
  <Route path="overview" element={<Overview />} />
  <Route path="planning" element={<ComingSoon section="Planning" />} />
  <Route path="packing" element={<ComingSoon section="Packing" />} />
  <Route path="finance" element={<ComingSoon section="Finance" />} />
  <Route path="discussion" element={<ComingSoon section="Discussion" />} />
</Route>
```

The top of `src/App.jsx` imports become:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RequireOnboarded } from './auth/RequireOnboarded'
import { AuthLayout } from './components/AuthLayout'
import { DashboardLayout } from './components/DashboardLayout'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { TripWorkspace } from './pages/TripWorkspace'
import { Overview } from './pages/Overview'
import { ComingSoon } from './pages/ComingSoon'
```

- [ ] **Step 7: Run the full suite** (`npm run test:run`) — Expected: all green (existing `App.test.jsx` still passes — it only asserts the login screen).

- [ ] **Step 8: Commit**

```bash
git add src/pages/TripWorkspace.jsx src/pages/TripWorkspace.module.css src/pages/TripWorkspace.test.jsx src/App.jsx
git commit -m "feat: rewrite TripWorkspace as trip shell + wire nested trip routes"
```

---

## Task 15: Lint, build, full suite, and manual smoke test

- [ ] **Step 1: Lint + full suite + build**

```bash
npm run lint
npm run test:run
npm run build
```
Expected: lint clean, all tests pass, build succeeds. Fix any lint issues (unused imports/vars) before continuing.

- [ ] **Step 2: Manual smoke test** (`npm run dev`, open `http://localhost:5173`, signed in, with at least one trip)

1. On the dashboard, click a trip card → you land on `/trip/<id>/overview`.
2. The sub-header shows the accent stripe, ← Trips, name/place/dates, and the code; the tab row shows Overview (active) + Planning/Packing/Finance/Discussion.
3. Click **Planning** → a "Planning is coming soon" stub; click **Overview** → back.
4. The Overview hero shows name/place/dates + the countdown badge; **Travellers** shows you (host).
5. Click **✎ Edit** → change the trip name → **Save changes** → the hero updates.
6. Under **Getting there**, click **+ Add** → pick **Flight** (fields read "From airport"/"To airport"/"Flight no.") → fill KLIA2 → Haneda, a date and time → **Save leg** → the leg appears.
7. Switch the method to **Bus** in the editor → the labels change to "From terminal"/"To terminal"/"Operator"; **Car** hides the reference field.
8. **✎** a leg → change it → save; **✕** a leg → confirm → it disappears.
9. In Supabase → Table Editor → `transport`: rows exist with `category = 'journey'` and the right `direction`.
10. Visit `/trip/<a-nonexistent-id>/overview` → "Trip not found".
11. Reload on the Overview → the trip and its legs persist (read via RLS).

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/project-shell-overview
```

---

## Definition of Done

- [ ] `npm run lint` clean, `npm run test:run` fully green, `npm run build` succeeds.
- [ ] Clicking a trip opens `/trip/:tripId/overview` inside the shell (sub-header + tabs); the other four tabs show "coming soon".
- [ ] The Overview shows the trip identity, journey transport (grouped Getting there / Getting back), and the travellers list.
- [ ] Host/editor can edit trip info and add/edit/remove method-aware journey legs; a viewer/non-writer sees a read-only Overview.
- [ ] A non-member / invalid `:tripId` shows the not-found state (RLS returns no row via `maybeSingle`).
- [ ] `transport` rows persist with `category = 'journey'`; `trips` edits are guarded by the update policy + `trips_dates_ck`.
- [ ] No secrets committed; invitations / ghosts / notifications / local transport remain out of scope (→ #2b, #3).

---

## Self-Review

**Spec coverage:** shell + tabs (Tasks 11, 14) · Overview hero (Task 13) · journey transport table + RLS (Task 1) · method-aware editor + grouped add flow (Tasks 8, 9) · trip edit + policy/CHECK (Tasks 1, 5, 7) · `useTrip` single-fetch + Outlet context (Tasks 4, 13, 14) · travellers (Task 10) · ComingSoon stubs (Task 12) · not-found/error/loading (Task 14) · data-map amendment realised by the `transport` table (Task 1) · testing (every task). No spec requirement is left without a task.

**Placeholder scan:** every code step contains complete code; no TBD/TODO/"similar to".

**Type consistency:** the form shape `{ id?, direction, method, departDate, departTime, from, to, reference, createdBy }` is produced by `blankLeg`/`rowToForm` (Task 2), consumed by `TransportEditorModal` (Task 8) and mapped to snake_case columns by `useUpsertTransport` (Task 6). `callerMember`/`canWrite` (Task 3) are used in `Overview` (Task 13). `useTrip` returns the trip consumed via Outlet context (Tasks 14 → 13). `monthDay` (Task 2) is used by `TripSubHeader`, `TransportSection`, `Overview`.
