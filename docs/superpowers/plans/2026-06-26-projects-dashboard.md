# Projects & Dashboard (#1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can create a trip and see their trips on a flip-card timeline dashboard.

**Architecture:** A `create_trip` Postgres RPC atomically inserts a trip + host membership; the dashboard reads trips with embedded members in one query (react-query). Pure date helpers arrange trips into previous/hero/future; a flip `TripCard` shows a boarding-pass front and a scrollable contributor back; a boarding-pass `Modal` collects new trips.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS + RPC), `react-router-dom`, `@tanstack/react-query`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-26-projects-dashboard-design.md`

**Branch:** `feat/projects-dashboard` (already created)

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/tripDates.js` | Pure date math + timeline arrangement (unit-tested) |
| `src/hooks/useTrips.js` | react-query read: trips + embedded members |
| `src/hooks/useCreateTrip.js` | react-query mutation: `create_trip` RPC |
| `src/components/JourneyBar.jsx` + `.module.css` | Route line + plane progress + label |
| `src/components/TripCard.jsx` + `.module.css` | Flip card (boarding-pass front / scrollable back) |
| `src/components/TripTimeline.jsx` + `.module.css` | Carousel rail: previous ← hero → future |
| `src/components/Modal.jsx` + `.module.css` | Accessible dialog primitive (reused later) |
| `src/components/CreateTripModal.jsx` + `.module.css` | New-trip form |
| `src/pages/Dashboard.jsx` (rewrite) | Empty state vs timeline; owns modal open state |

Reuses from Foundation: `PlaneIcon`, the design tokens (`styles/tokens.css`), `useAuth`, `supabase`.

---

## Task 1: Supabase backend — tables, RLS helpers, policies, `create_trip` RPC

Runs SQL in the Supabase dashboard. No repo changes; verification is via SQL + the Task 11 smoke test.

- [ ] **Step 1: Create tables, helpers, policies, grant, and the RPC**

Supabase Dashboard → SQL Editor → run:

```sql
-- Tables ---------------------------------------------------------------
create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  place        text not null,
  start_date   date not null,
  end_date     date not null,
  accent_color text not null,
  code         text not null,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table public.trip_members (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  user_id       uuid references public.profiles(id),
  display_name  text,
  role          text not null check (role in ('host','editor','viewer')),
  invite_status text not null default 'accepted' check (invite_status in ('pending','accepted')),
  created_at    timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index on public.trip_members (trip_id);
create index on public.trips (created_by);

-- RLS helpers (security definer → bypass RLS inside, no recursion) -------
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

-- RLS (reads only in #1; writes go through create_trip) ------------------
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;

create policy "trips_select_member" on public.trips
  for select using (public.is_trip_member(id));

create policy "trip_members_select_member" on public.trip_members
  for select using (public.is_trip_member(trip_id));

grant select on public.trips, public.trip_members to authenticated;

-- Atomic creation RPC ---------------------------------------------------
create function public.create_trip(
  p_name text, p_place text, p_start date, p_end date
) returns public.trips language plpgsql security definer set search_path = public as $$
declare v_trip public.trips;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_name = '' or p_place = '' then raise exception 'name and place required'; end if;
  if p_end < p_start then raise exception 'end_date before start_date'; end if;

  insert into trips (name, place, start_date, end_date, accent_color, code, created_by)
  values (
    p_name, p_place, p_start, p_end,
    (array['#0EA5E9','#22C55E','#F59E0B','#A855F7','#EC4899','#14B8A6'])[1 + (floor(random()*6))::int],
    'TRIP·' || lpad(((floor(random()*99))::int + 1)::text, 2, '0'),
    auth.uid()
  )
  returning * into v_trip;

  insert into trip_members (trip_id, user_id, role, invite_status)
  values (v_trip.id, auth.uid(), 'host', 'accepted');

  return v_trip;
end;
$$;

grant execute on function public.create_trip(text, text, date, date) to authenticated;
```

- [ ] **Step 2: Verify**

```sql
select tablename, policyname, cmd from pg_policies
where tablename in ('trips','trip_members');
```
Expected: `trips_select_member` (SELECT) and `trip_members_select_member` (SELECT).

```sql
select proname from pg_proc where proname in ('is_trip_member','trip_role','create_trip');
```
Expected: all three rows.

- [ ] **Step 3: Smoke-create a row** (optional, run as a logged-in user via the app later in Task 11). No commit — database only.

---

## Task 2: Pure date + timeline helpers (`lib/tripDates.js`)

**Files:**
- Create: `src/lib/tripDates.js`
- Test: `src/lib/tripDates.test.js`

- [ ] **Step 1: Write the failing test** `src/lib/tripDates.test.js`

```js
import { describe, it, expect } from 'vitest'
import {
  nights,
  daysToGo,
  tripStatus,
  countdownLabel,
  journeyProgress,
  arrangeTimeline,
} from './tripDates'

const trip = (start_date, end_date, extra = {}) => ({ start_date, end_date, ...extra })

describe('tripDates', () => {
  it('nights = whole days between start and end', () => {
    expect(nights(trip('2026-07-12', '2026-07-19'))).toBe(7)
  })

  it('daysToGo counts days from today to start', () => {
    expect(daysToGo(trip('2026-07-12', '2026-07-19'), '2026-06-30')).toBe(12)
    expect(daysToGo(trip('2026-07-12', '2026-07-19'), '2026-07-12')).toBe(0)
  })

  it('tripStatus classifies at boundaries', () => {
    const t = trip('2026-07-12', '2026-07-19')
    expect(tripStatus(t, '2026-07-11')).toBe('upcoming')
    expect(tripStatus(t, '2026-07-12')).toBe('current')
    expect(tripStatus(t, '2026-07-19')).toBe('current')
    expect(tripStatus(t, '2026-07-20')).toBe('past')
  })

  it('countdownLabel reflects status', () => {
    const t = trip('2026-07-12', '2026-07-19')
    expect(countdownLabel(t, '2026-06-30')).toBe('12 days to go')
    expect(countdownLabel(trip('2026-07-12', '2026-07-19'), '2026-07-11')).toBe('1 day to go')
    expect(countdownLabel(t, '2026-07-13')).toBe('In progress · Day 2')
    expect(countdownLabel(t, '2026-07-20')).toBe('Completed')
  })

  it('journeyProgress clamps 0..1 over a 30-day window', () => {
    const t = trip('2026-07-12', '2026-07-19')
    expect(journeyProgress(t, '2026-06-01')).toBe(0) // >30 days out
    expect(journeyProgress(t, '2026-06-27')).toBeCloseTo(0.5, 5) // 15 days out
    expect(journeyProgress(t, '2026-07-12')).toBe(1) // departure
    expect(journeyProgress(t, '2026-07-15')).toBe(1) // in progress
  })

  it('arrangeTimeline picks hero and splits previous/future', () => {
    const past = trip('2026-02-03', '2026-02-10', { id: 'past' })
    const soon = trip('2026-07-12', '2026-07-19', { id: 'soon' })
    const later = trip('2026-10-02', '2026-10-08', { id: 'later' })
    const r = arrangeTimeline([later, past, soon], '2026-06-30')
    expect(r.previous.map((t) => t.id)).toEqual(['past'])
    expect(r.hero.id).toBe('soon')
    expect(r.future.map((t) => t.id)).toEqual(['later'])
  })

  it('arrangeTimeline returns null hero when all trips are past', () => {
    const r = arrangeTimeline([trip('2026-01-01', '2026-01-05', { id: 'a' })], '2026-06-30')
    expect(r.hero).toBeNull()
    expect(r.previous.map((t) => t.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test:run -- src/lib/tripDates.test.js`
Expected: FAIL (cannot resolve `./tripDates`).

- [ ] **Step 3: Implement** `src/lib/tripDates.js`

```js
// All dates are 'YYYY-MM-DD' strings; compared as UTC day numbers (timezone-safe).
function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function nights(trip) {
  return dayNumber(trip.end_date) - dayNumber(trip.start_date)
}

export function daysToGo(trip, today) {
  return dayNumber(trip.start_date) - dayNumber(today)
}

export function tripStatus(trip, today) {
  const t = dayNumber(today)
  if (dayNumber(trip.end_date) < t) return 'past'
  if (dayNumber(trip.start_date) <= t) return 'current'
  return 'upcoming'
}

export function countdownLabel(trip, today) {
  const status = tripStatus(trip, today)
  if (status === 'past') return 'Completed'
  if (status === 'current') {
    const day = dayNumber(today) - dayNumber(trip.start_date) + 1
    return `In progress · Day ${day}`
  }
  const d = daysToGo(trip, today)
  return d === 1 ? '1 day to go' : `${d} days to go`
}

export function journeyProgress(trip, today, window = 30) {
  if (tripStatus(trip, today) !== 'upcoming') return 1
  const p = (window - daysToGo(trip, today)) / window
  return Math.min(1, Math.max(0, p))
}

export function arrangeTimeline(trips, today) {
  const previous = []
  const notPast = []
  for (const trip of trips) {
    if (tripStatus(trip, today) === 'past') previous.push(trip)
    else notPast.push(trip)
  }
  notPast.sort((a, b) => dayNumber(a.start_date) - dayNumber(b.start_date))
  previous.sort((a, b) => dayNumber(b.start_date) - dayNumber(a.start_date))
  const [hero = null, ...future] = notPast
  return { previous, hero, future }
}
```

- [ ] **Step 4: Run, confirm PASS** (`npm run test:run -- src/lib/tripDates.test.js`) — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tripDates.js src/lib/tripDates.test.js
git commit -m "feat: add pure trip date + timeline arrangement helpers"
```

---

## Task 3: `useTrips` hook

**Files:**
- Create: `src/hooks/useTrips.js`
- Test: `src/hooks/useTrips.test.jsx`

- [ ] **Step 1: Write the failing test** `src/hooks/useTrips.test.jsx`

```jsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { select, from } = vi.hoisted(() => {
  const select = vi.fn()
  const from = vi.fn(() => ({ select }))
  return { select, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useTrips } from './useTrips'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTrips', () => {
  it('fetches trips with embedded members', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    select.mockResolvedValue({ data: [{ id: 't1', name: 'Tokyo', trip_members: [] }], error: null })

    const { result } = renderHook(() => useTrips(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('trips')
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('trip_members'),
    )
    expect(result.current.data[0].name).toBe('Tokyo')
  })

  it('is disabled with no user', () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useTrips(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL** (`npm run test:run -- src/hooks/useTrips.test.jsx`).

- [ ] **Step 3: Implement** `src/hooks/useTrips.js`

```js
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

const TRIP_SELECT =
  '*, trip_members(id, user_id, display_name, role, profiles(display_name, avatar_url))'

export function useTrips() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['trips', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('trips').select(TRIP_SELECT)
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTrips.js src/hooks/useTrips.test.jsx
git commit -m "feat: add useTrips hook (trips + embedded members)"
```

---

## Task 4: `useCreateTrip` hook

**Files:**
- Create: `src/hooks/useCreateTrip.js`
- Test: `src/hooks/useCreateTrip.test.jsx`

- [ ] **Step 1: Write the failing test** `src/hooks/useCreateTrip.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useCreateTrip } from './useCreateTrip'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useCreateTrip', () => {
  it('calls the create_trip RPC with mapped params', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    rpc.mockResolvedValue({ data: { id: 't9' }, error: null })

    const { result } = renderHook(() => useCreateTrip(), { wrapper })
    result.current.mutate({
      name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('create_trip', {
      p_name: 'Tokyo', p_place: 'Tokyo, Japan', p_start: '2026-07-12', p_end: '2026-07-19',
    })
  })

  it('surfaces an RPC error', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const { result } = renderHook(() => useCreateTrip(), { wrapper })
    result.current.mutate({ name: 'x', place: 'y', startDate: '2026-07-12', endDate: '2026-07-19' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/hooks/useCreateTrip.js`

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useCreateTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ name, place, startDate, endDate }) => {
      const { data, error } = await supabase.rpc('create_trip', {
        p_name: name,
        p_place: place,
        p_start: startDate,
        p_end: endDate,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips', user?.id] }),
  })
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreateTrip.js src/hooks/useCreateTrip.test.jsx
git commit -m "feat: add useCreateTrip mutation (create_trip RPC)"
```

---

## Task 5: `JourneyBar` component

**Files:**
- Create: `src/components/JourneyBar.jsx`, `src/components/JourneyBar.module.css`
- Test: `src/components/JourneyBar.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/JourneyBar.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JourneyBar } from './JourneyBar'

describe('JourneyBar', () => {
  it('renders the label and a progressbar with clamped value', () => {
    render(<JourneyBar progress={0.5} label="12 days" />)
    expect(screen.getByText('12 days')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '50')
  })

  it('clamps progress above 1 to 100', () => {
    render(<JourneyBar progress={1.4} label="go" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/JourneyBar.jsx`

```jsx
import { PlaneIcon } from './PlaneIcon'
import styles from './JourneyBar.module.css'

export function JourneyBar({ progress, label }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)))
  return (
    <div className={styles.bar}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
        aria-label="Time until departure"
      >
        <span className={styles.fill} style={{ width: `${pct}%` }} />
        <span className={styles.plane} style={{ left: `${pct}%` }}>
          <PlaneIcon className={styles.planeIcon} />
        </span>
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  )
}
```

- [ ] **Step 4: Implement** `src/components/JourneyBar.module.css`

```css
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.track {
  position: relative;
  flex: 1;
  height: 4px;
  border-radius: 4px;
  background: var(--c-sky-100);
}
.fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: var(--accent);
}
.plane {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  color: var(--accent);
  display: grid;
  place-items: center;
}
.planeIcon {
  width: 14px;
  height: 14px;
}
.label {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/JourneyBar.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/JourneyBar.jsx src/components/JourneyBar.module.css src/components/JourneyBar.test.jsx
git commit -m "feat: add JourneyBar progress component"
```

---

## Task 6: `TripCard` component (flip)

**Files:**
- Create: `src/components/TripCard.jsx`, `src/components/TripCard.module.css`
- Test: `src/components/TripCard.test.jsx`

The card takes `trip` (with `trip_members`), `today`, and optional `size="hero"`. Local
`flipped` state toggles on click and Enter/Space.

- [ ] **Step 1: Write the failing test** `src/components/TripCard.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TripCard } from './TripCard'

const trip = {
  id: 't1',
  name: 'Tokyo Trip',
  place: 'Tokyo, Japan',
  start_date: '2026-07-12',
  end_date: '2026-07-19',
  accent_color: '#0EA5E9',
  code: 'TRIP·07',
  trip_members: [
    { id: 'm1', role: 'host', display_name: null, profiles: { display_name: 'Ana' } },
    { id: 'm2', role: 'editor', display_name: null, profiles: { display_name: 'Ben' } },
  ],
}

describe('TripCard', () => {
  it('shows the front: name, place, dates, countdown', () => {
    render(<TripCard trip={trip} today="2026-06-30" />)
    expect(screen.getByText('Tokyo Trip')).toBeInTheDocument()
    expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument()
    expect(screen.getByText('12 days to go')).toBeInTheDocument()
  })

  it('flips to the back on click, showing travellers and roles', async () => {
    render(<TripCard trip={trip} today="2026-06-30" />)
    await userEvent.click(screen.getByRole('button', { name: /tokyo trip/i }))
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('flips with the keyboard', async () => {
    render(<TripCard trip={trip} today="2026-06-30" />)
    const card = screen.getByRole('button', { name: /tokyo trip/i })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('2 Travellers')).toBeInTheDocument()
  })
}) 
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/TripCard.jsx`

```jsx
import { useState } from 'react'
import { countdownLabel, nights, journeyProgress } from '../lib/tripDates'
import { JourneyBar } from './JourneyBar'
import styles from './TripCard.module.css'

function fmt(dateStr) {
  const [, m, d] = dateStr.split('-')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${months[Number(m) - 1]} ${d}`
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export function TripCard({ trip, today, size }) {
  const [flipped, setFlipped] = useState(false)
  const members = trip.trip_members ?? []
  const label = countdownLabel(trip, today)

  function toggle() {
    setFlipped((f) => !f)
  }
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <div
      className={`${styles.card} ${size === 'hero' ? styles.hero : ''} ${flipped ? styles.flipped : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${trip.name}. Tap to flip.`}
      onClick={toggle}
      onKeyDown={onKey}
    >
      <div className={styles.inner}>
        <section className={styles.front}>
          <span className={styles.colbar} style={{ background: trip.accent_color }} />
          <div className={styles.pad}>
            <div className={styles.ey}>
              <span>BOARDING PASS</span>
              <span className={styles.code}>{trip.code}</span>
            </div>
            <h3 className={styles.dest}>{trip.name}</h3>
            <p className={styles.place}>
              <span className={styles.dot} /> {trip.place}
            </p>
            <p className={styles.dates}>
              {fmt(trip.start_date)} — {fmt(trip.end_date)} · {nights(trip)} nights
            </p>
            <div className={styles.perf} />
            <span className={styles.badge}>{label}</span>
            <p className={styles.hint}>⟲ tap to flip</p>
          </div>
        </section>

        <section className={styles.back}>
          <span className={styles.colbar} style={{ background: trip.accent_color }} />
          <div className={styles.pad}>
            <p className={styles.bktitle}>{members.length} Travellers</p>
            <JourneyBar progress={journeyProgress(trip, today)} label={label} />
            <div className={styles.scrollwrap}>
              <ul className={styles.clist}>
                {members.map((m) => (
                  <li key={m.id}>
                    <span className={styles.av} style={{ background: trip.accent_color }}>
                      {initials(m.profiles?.display_name ?? m.display_name)}
                    </span>
                    {m.profiles?.display_name ?? m.display_name ?? 'Guest'}
                    <span className={`${styles.tag} ${m.role === 'host' ? styles.host : ''}`}>
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className={styles.hint}>⟲ tap to flip back</p>
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement** `src/components/TripCard.module.css`

```css
.card {
  width: 240px;
  height: 330px;
  perspective: 1200px;
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 0;
}
.card:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
  border-radius: 18px;
}
.hero {
  width: 268px;
  height: 366px;
}
.inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.5s var(--ease);
  transform-style: preserve-3d;
}
.flipped .inner {
  transform: rotateY(180deg);
}
.front,
.back {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow-md);
  backface-visibility: hidden;
}
.back {
  transform: rotateY(180deg);
}
.colbar {
  height: 7px;
  flex: none;
}
.pad {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 16px;
}
.ey {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-muted);
}
.code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--primary-strong);
  background: var(--c-mist);
  padding: 2px 7px;
  border-radius: 6px;
}
.dest {
  margin: 10px 0 2px;
  font-size: 21px;
}
.place {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--ink-muted);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
}
.dates {
  margin: 12px 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
}
.perf {
  margin: 10px -16px;
  border-top: 2px dashed var(--border);
}
.badge {
  align-self: flex-start;
  padding: 4px 11px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  border-radius: 999px;
}
.hint {
  margin-top: auto;
  padding-top: 10px;
  text-align: center;
  font-size: 11px;
  color: var(--ink-muted);
}
.bktitle {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
  margin-bottom: 10px;
}
.scrollwrap {
  flex: 1;
  min-height: 0;
  margin-top: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--primary) var(--c-sky-100);
}
.clist {
  list-style: none;
  margin: 0;
  padding: 0;
}
.clist li {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 0;
  font-size: 13.5px;
  color: var(--ink);
  border-bottom: 1px solid #eef2f6;
}
.av {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #fff;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.tag {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.host {
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .inner {
    transition: none;
  }
  .flipped .inner {
    transform: none;
  }
  .flipped .front {
    display: none;
  }
  .back {
    transform: none;
  }
  .flipped .back {
    position: relative;
  }
  .front {
    position: relative;
  }
}
```

> Note: the reduced-motion block swaps the 3D flip for a simple show/hide so the back is
> reachable without rotation. Keep the front `position: relative` override scoped under the
> reduced-motion media query as written.

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/TripCard.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/TripCard.jsx src/components/TripCard.module.css src/components/TripCard.test.jsx
git commit -m "feat: add flip TripCard (boarding-pass front, scrollable back)"
```

---

## Task 7: `TripTimeline` component

**Files:**
- Create: `src/components/TripTimeline.jsx`, `src/components/TripTimeline.module.css`
- Test: `src/components/TripTimeline.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/TripTimeline.test.jsx`

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TripTimeline } from './TripTimeline'

const mk = (id, start_date, end_date) => ({
  id, name: id, place: 'P', start_date, end_date,
  accent_color: '#0EA5E9', code: 'TRIP·01', trip_members: [],
})

describe('TripTimeline', () => {
  it('renders previous, hero, and future trips', () => {
    const trips = [
      mk('past', '2026-02-03', '2026-02-10'),
      mk('soon', '2026-07-12', '2026-07-19'),
      mk('later', '2026-10-02', '2026-10-08'),
    ]
    render(<TripTimeline trips={trips} today="2026-06-30" />)
    expect(screen.getByRole('button', { name: /past/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /soon/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument()
    // hero is marked for the layout
    expect(screen.getByTestId('hero-slot')).toHaveTextContent('soon')
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/TripTimeline.jsx`

```jsx
import { arrangeTimeline } from '../lib/tripDates'
import { TripCard } from './TripCard'
import styles from './TripTimeline.module.css'

export function TripTimeline({ trips, today }) {
  const { previous, hero, future } = arrangeTimeline(trips, today)
  return (
    <div className={styles.rail}>
      {previous.map((trip) => (
        <div key={trip.id} className={styles.slot}>
          <TripCard trip={trip} today={today} />
        </div>
      ))}
      {hero && (
        <div className={`${styles.slot} ${styles.heroSlot}`} data-testid="hero-slot">
          <TripCard trip={hero} today={today} size="hero" />
        </div>
      )}
      {future.map((trip) => (
        <div key={trip.id} className={styles.slot}>
          <TripCard trip={trip} today={today} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement** `src/components/TripTimeline.module.css`

```css
.rail {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-6) var(--space-2);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}
.slot {
  flex: none;
  scroll-snap-align: center;
}
.heroSlot {
  scroll-snap-align: center;
}
```

> The hero is naturally centered on load via `scroll-snap-align: center`. A follow-up can
> add a scroll-into-view on mount; not required for this slice.

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/TripTimeline.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/TripTimeline.jsx src/components/TripTimeline.module.css src/components/TripTimeline.test.jsx
git commit -m "feat: add TripTimeline carousel (previous/hero/future)"
```

---

## Task 8: `Modal` primitive

**Files:**
- Create: `src/components/Modal.jsx`, `src/components/Modal.module.css`
- Test: `src/components/Modal.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/Modal.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

beforeEach(() => vi.clearAllMocks())

describe('Modal', () => {
  it('renders children only when open', () => {
    const { rerender } = render(
      <Modal isOpen={false} onClose={() => {}} title="New trip"><p>Body</p></Modal>,
    )
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
    rerender(<Modal isOpen onClose={() => {}} title="New trip"><p>Body</p></Modal>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('closes on Escape and backdrop click', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} title="New trip"><p>Body</p></Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/Modal.jsx`

```jsx
import { useEffect, useRef } from 'react'
import styles from './Modal.module.css'

export function Modal({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className={styles.backdrop}
      data-testid="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement** `src/components/Modal.module.css`

```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: rgba(12, 74, 110, 0.35);
  backdrop-filter: blur(2px);
}
.dialog {
  width: 100%;
  max-width: 420px;
  outline: none;
}
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/Modal.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/Modal.jsx src/components/Modal.module.css src/components/Modal.test.jsx
git commit -m "feat: add accessible Modal primitive"
```

---

## Task 9: `CreateTripModal`

**Files:**
- Create: `src/components/CreateTripModal.jsx`, `src/components/CreateTripModal.module.css`
- Test: `src/components/CreateTripModal.test.jsx`

- [ ] **Step 1: Write the failing test** `src/components/CreateTripModal.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useCreateTrip', () => ({ useCreateTrip: vi.fn() }))
import { useCreateTrip } from '../hooks/useCreateTrip'
import { CreateTripModal } from './CreateTripModal'

beforeEach(() => vi.clearAllMocks())

function setup(mutate = vi.fn()) {
  useCreateTrip.mockReturnValue({ mutate, isPending: false, isError: false })
  render(<CreateTripModal isOpen onClose={vi.fn()} />)
  return mutate
}

// Use fireEvent.change — userEvent.type does not reliably drive type="date" in jsdom.
function fill({ name, place, start, end }) {
  if (name !== undefined)
    fireEvent.change(screen.getByLabelText(/trip name/i), { target: { value: name } })
  if (place !== undefined)
    fireEvent.change(screen.getByLabelText(/place/i), { target: { value: place } })
  if (start !== undefined)
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: start } })
  if (end !== undefined)
    fireEvent.change(screen.getByLabelText(/end/i), { target: { value: end } })
}

describe('CreateTripModal', () => {
  it('blocks submit until all fields are filled', async () => {
    const mutate = setup()
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/all fields are required/i)).toBeInTheDocument()
  })

  it('blocks submit when end is before start', async () => {
    const mutate = setup()
    fill({ name: 'Tokyo', place: 'Tokyo', start: '2026-07-19', end: '2026-07-12' })
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument()
  })

  it('submits a valid trip', async () => {
    const mutate = setup()
    fill({ name: 'Tokyo', place: 'Tokyo, Japan', start: '2026-07-12', end: '2026-07-19' })
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(mutate).toHaveBeenCalledWith(
      { name: 'Tokyo', place: 'Tokyo, Japan', startDate: '2026-07-12', endDate: '2026-07-19' },
      expect.any(Object),
    )
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `src/components/CreateTripModal.jsx`

```jsx
import { useState } from 'react'
import { Modal } from './Modal'
import { useCreateTrip } from '../hooks/useCreateTrip'
import styles from './CreateTripModal.module.css'

const EMPTY = { name: '', place: '', startDate: '', endDate: '' }

export function CreateTripModal({ isOpen, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const { mutate, isPending } = useCreateTrip()

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
      {
        onSuccess: () => {
          setForm(EMPTY)
          onClose()
        },
        onError: () => setError('Could not create the trip. Please try again.'),
      },
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New trip">
      <form className={styles.pass} onSubmit={handleSubmit}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>NEW BOARDING PASS</p>
          <h2 className={styles.title}>Plan a trip</h2>

          <label className={styles.label} htmlFor="t-name">Trip name</label>
          <input id="t-name" className={styles.input} value={form.name} onChange={set('name')} placeholder="Tokyo Trip" autoFocus />

          <label className={styles.label} htmlFor="t-place">Place</label>
          <input id="t-place" className={styles.input} value={form.place} onChange={set('place')} placeholder="Tokyo, Japan" />

          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="t-start">Start date</label>
              <input id="t-start" type="date" className={styles.input} value={form.startDate} onChange={set('startDate')} />
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="t-end">End date</label>
              <input id="t-end" type="date" className={styles.input} value={form.endDate} onChange={set('endDate')} />
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={isPending}>
              {isPending ? 'Creating…' : 'Create trip'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Implement** `src/components/CreateTripModal.module.css`

```css
.pass {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.colbar {
  height: 7px;
  background: var(--primary);
}
.pad {
  padding: var(--space-6);
}
.ey {
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
  font-weight: 700;
}
.title {
  margin: 6px 0 var(--space-5);
  font-size: 24px;
}
.label {
  display: block;
  margin: var(--space-3) 0 var(--space-1);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-muted);
}
.input {
  width: 100%;
  padding: var(--space-3);
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink);
  background: var(--c-mist);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
}
.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18);
}
.row {
  display: flex;
  gap: var(--space-3);
}
.col {
  flex: 1;
}
.error {
  margin-top: var(--space-3);
  color: var(--c-danger);
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-5);
}
.cancel {
  padding: var(--space-3) var(--space-4);
  font-weight: 600;
  color: var(--ink-muted);
  background: transparent;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
}
.submit {
  padding: var(--space-3) var(--space-5);
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-md);
}
.submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/components/CreateTripModal.test.jsx`).

- [ ] **Step 6: Commit**

```bash
git add src/components/CreateTripModal.jsx src/components/CreateTripModal.module.css src/components/CreateTripModal.test.jsx
git commit -m "feat: add CreateTripModal with validation"
```

---

## Task 10: Dashboard rewrite (wire it together)

**Files:**
- Modify: `src/pages/Dashboard.jsx` (rewrite), `src/pages/Dashboard.module.css` (extend)
- Test: `src/pages/Dashboard.test.jsx` (rewrite)

- [ ] **Step 1: Write the failing test** `src/pages/Dashboard.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useTrips', () => ({ useTrips: vi.fn() }))
vi.mock('../components/CreateTripModal', () => ({
  CreateTripModal: ({ isOpen }) => (isOpen ? <div>Create Modal</div> : null),
}))
vi.mock('../components/TripTimeline', () => ({
  TripTimeline: ({ trips }) => <div>Timeline: {trips.length}</div>,
}))

import { useTrips } from '../hooks/useTrips'
import { Dashboard } from './Dashboard'

beforeEach(() => vi.clearAllMocks())

describe('Dashboard', () => {
  it('shows the empty state when there are no trips', () => {
    useTrips.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<Dashboard />)
    expect(screen.getByText(/no trips yet/i)).toBeInTheDocument()
  })

  it('shows the timeline when trips exist', () => {
    useTrips.mockReturnValue({ data: [{ id: 't1' }], isLoading: false, isError: false })
    render(<Dashboard />)
    expect(screen.getByText(/timeline: 1/i)).toBeInTheDocument()
  })

  it('opens the create modal from the header button', async () => {
    useTrips.mockReturnValue({ data: [{ id: 't1' }], isLoading: false, isError: false })
    render(<Dashboard />)
    await userEvent.click(screen.getByRole('button', { name: /new trip/i }))
    expect(screen.getByText('Create Modal')).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    const refetch = vi.fn()
    useTrips.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch })
    render(<Dashboard />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Rewrite** `src/pages/Dashboard.jsx`

```jsx
import { useState } from 'react'
import { useTrips } from '../hooks/useTrips'
import { TripTimeline } from '../components/TripTimeline'
import { CreateTripModal } from '../components/CreateTripModal'
import { PlaneIcon } from '../components/PlaneIcon'
import styles from './Dashboard.module.css'

const today = () => new Date().toISOString().slice(0, 10)

export function Dashboard() {
  const { data: trips, isLoading, isError, refetch } = useTrips()
  const [creating, setCreating] = useState(false)

  return (
    <section>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Your trips</h1>
          <p className={styles.sub}>Plan journeys with your crew.</p>
        </div>
        <button type="button" className={styles.newTrip} onClick={() => setCreating(true)}>
          + New trip
        </button>
      </div>

      {isLoading && <p className={styles.muted}>Loading your trips…</p>}

      {isError && (
        <div role="alert" className={styles.error}>
          <p>We couldn&apos;t load your trips. Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()}>Try again</button>
        </div>
      )}

      {!isLoading && !isError && trips?.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyBadge}><PlaneIcon className={styles.emptyPlane} /></span>
          <h2 className={styles.emptyTitle}>No trips yet</h2>
          <p className={styles.emptyText}>
            Create your first trip and invite friends to start planning together.
          </p>
          <button type="button" className={styles.emptyCta} onClick={() => setCreating(true)}>
            Plan your first journey
          </button>
        </div>
      )}

      {!isLoading && !isError && trips?.length > 0 && (
        <TripTimeline trips={trips} today={today()} />
      )}

      <CreateTripModal isOpen={creating} onClose={() => setCreating(false)} />
    </section>
  )
}
```

- [ ] **Step 4: Extend** `src/pages/Dashboard.module.css` — append:

```css
.muted {
  color: var(--ink-muted);
}
.error {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.error button {
  padding: var(--space-2) var(--space-4);
  font-weight: 600;
  color: var(--primary-strong);
  background: transparent;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
}
```

(The existing `.header`, `.title`, `.sub`, `.newTrip`, `.empty*` rules from Foundation
remain and are reused.)

- [ ] **Step 5: Run, confirm PASS** (`npm run test:run -- src/pages/Dashboard.test.jsx`).

- [ ] **Step 6: Run the full suite** (`npm run test:run`) — Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard.jsx src/pages/Dashboard.module.css src/pages/Dashboard.test.jsx
git commit -m "feat: wire Dashboard to trips, timeline, and create modal"
```

---

## Task 11: Lint, build, and manual smoke test

- [ ] **Step 1: Lint + full suite + build**

```bash
npm run lint
npm run test:run
npm run build
```
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 2: Manual smoke test** (`npm run dev`, open `http://localhost:5173`, signed in)

1. Dashboard shows the empty state ("No trips yet").
2. Click **+ New trip** → the boarding-pass modal opens.
3. Submit with a blank field → "All fields are required."; with end < start → date error.
4. Fill name/place/start/end → **Create trip** → modal closes, a card appears on the timeline.
5. The card front shows name, place, dates, and a "X days to go" badge.
6. Click the card → it flips; the back shows "1 Travellers" (you, host) + the journey bar.
7. In Supabase → Table Editor: a `trips` row exists and a `trip_members` row (role `host`).
8. Reload → the trip is still there (persisted + read via RLS).

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/projects-dashboard
```

---

## Definition of Done

- [ ] `npm run lint` clean, `npm run test:run` fully green, `npm run build` succeeds.
- [ ] Creating a trip persists a `trips` row + a host `trip_members` row via `create_trip`.
- [ ] The dashboard reads only the caller's trips (RLS) and arranges them previous/hero/future.
- [ ] The trip card flips (mouse + keyboard) and the back lists travellers with the journey bar.
- [ ] No secrets committed; bell/invitations/co-members remain out of scope (→ #2).
```
