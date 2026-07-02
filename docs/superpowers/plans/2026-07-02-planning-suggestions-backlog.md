# Planning — Suggestions Backlog (#3a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/trip/:tripId/planning` stub into a **Suggestions Backlog** — host/editors add place, stay, and local-transport idea cards (no trip-schedule date/time), shown in grouped, hover-flip cards with an availability filter clamped to the trip window.

**Architecture:** New `plan_items` table (explicit columns; place + hostel) with RLS; local transport reuses the existing `transport` table with `category='local'` (+ a new `note` column). Data is read via the existing one-fetch-per-trip `useTrip` (extended to embed `plan_items`), passed through the trip shell's `<Outlet context>`. Writes are plain RLS-guarded mutations. UI: a `Planning` page → `PlanningBacklog` (filter + 3 grouped sections) → `SuggestionCard` (flip) + an adaptive `SuggestionEditorModal` (name → type → conditional fields) that routes saves to `plan_items` or `transport`.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS), `react-router-dom`, `@tanstack/react-query`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-02-planning-suggestions-backlog-design.md`

**Branch:** `feat/planning-backlog` (create at execution start; repo currently on `main`)

**Test commands:** `npm run test:run` (all) · `npx vitest run <path>` (one file). If a run prints "no tests" spuriously, re-run once (cold-start flake seen on this project).

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/placeCategories.js` + test | place category → `{label, color}` (single source of truth) |
| `src/lib/suggestionTypes.js` + test | add-form type list → `{key,label,color,target,kind,category}` |
| `src/lib/planItems.js` + test | pure: availability match/label, form↔row mappers, type-key derivation |
| `src/hooks/useUpsertPlanItem.js` + test | insert/update a place\|hostel |
| `src/hooks/useDeletePlanItem.js` + test | delete a plan item |
| `src/hooks/useUpsertTransport.js` (modify) + test | accept `category` (default `journey`) + nullable `direction` + `note` |
| `src/hooks/useTrip.js` (modify) + test | embed `plan_items(*)` in the trip select |
| `src/components/SuggestionCard.jsx` + css + test | flip card (front compact / back details); editor ✎/✕ |
| `src/components/SuggestionEditorModal.jsx` + css + test | adaptive add/edit form; routes save by type |
| `src/components/PlanningBacklog.jsx` + css + test | availability filter + 3 grouped sections + Add |
| `src/pages/Planning.jsx` + css + test | page: reads trip from context; owns modal state |
| `src/App.jsx` (modify) | `/planning` route → `<Planning/>` (replace `ComingSoon`) |

Reuses: `Modal`, `callerMember`/`canWrite` (`lib/tripAccess`), `initials` (`lib/display`), transport method config (`lib/transport`: `TRANSPORT_METHODS`, `METHOD_KEYS`, `methodMeta`), RLS helpers `is_trip_member`/`trip_role`, design tokens.

---

## Task 1: Supabase backend — `plan_items` table + RLS, `transport.note`

SQL in the Supabase dashboard. No repo changes, no commit. Verified by SQL + the Task 12 smoke test.

- [ ] **Step 1: Run the SQL**

Supabase Dashboard → SQL Editor → run:

```sql
-- plan_items: place + hostel suggestion cards (transport lives in its own table) ---
create table public.plan_items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  kind          text not null check (kind in ('place','hostel')),
  category      text,
  title         text not null,
  location      text,
  link          text,
  description   text,
  price_range   text,
  avail_days    int[],
  avail_open    time,
  avail_close   time,
  avail_start_date date,
  avail_end_date   date,
  check_in_date  date,
  check_out_date date,
  status        text not null default 'pending',
  sort_order    int not null default 0,
  created_by    uuid references public.trip_members(id) on delete set null,
  created_at    timestamptz not null default now()
);
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

-- transport: optional note (used by local suggestions; also fine for journey legs) --
alter table public.transport add column if not exists note text;
```

- [ ] **Step 2: Verify**

```sql
select policyname, cmd from pg_policies where tablename = 'plan_items' order by policyname;
```
Expected: `plan_items_delete_writer` (DELETE), `plan_items_insert_writer` (INSERT), `plan_items_select_member` (SELECT), `plan_items_update_writer` (UPDATE).

```sql
select column_name from information_schema.columns where table_name='transport' and column_name='note';
```
Expected: one row (`note`).

No commit — database only.

---

## Task 2: Config — `placeCategories.js` + `suggestionTypes.js`

**Files:**
- Create: `src/lib/placeCategories.js`, `src/lib/placeCategories.test.js`
- Create: `src/lib/suggestionTypes.js`, `src/lib/suggestionTypes.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/placeCategories.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PLACE_CATEGORIES, PLACE_CATEGORY_KEYS, categoryMeta } from './placeCategories'

describe('placeCategories', () => {
  it('every category has a label and a color', () => {
    for (const meta of Object.values(PLACE_CATEGORIES)) {
      expect(typeof meta.label).toBe('string')
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
  it('exposes the keys and falls back to "other" for unknown', () => {
    expect(PLACE_CATEGORY_KEYS).toContain('visit')
    expect(categoryMeta('nope')).toBe(PLACE_CATEGORIES.other)
    expect(categoryMeta('meal').label).toBe('Meal')
  })
})
```

Create `src/lib/suggestionTypes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { SUGGESTION_TYPES, suggestionType } from './suggestionTypes'

describe('suggestionTypes', () => {
  it('maps every place category to plan_items/place and includes stay + transport', () => {
    const visit = suggestionType('visit')
    expect(visit).toMatchObject({ target: 'plan_items', kind: 'place', category: 'visit' })
    expect(suggestionType('stay')).toMatchObject({ target: 'plan_items', kind: 'hostel', category: null })
    expect(suggestionType('transport')).toMatchObject({ target: 'transport' })
  })
  it('every type has a key, label and color; unknown returns null', () => {
    for (const t of SUGGESTION_TYPES) {
      expect(t.key).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
    expect(suggestionType('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/placeCategories.test.js src/lib/suggestionTypes.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/lib/placeCategories.js`:

```js
// Single source of truth: each place category's label + badge color together.
export const PLACE_CATEGORIES = {
  visit:    { label: 'Visit',    color: '#0EA5E9' },
  meal:     { label: 'Meal',     color: '#F59E0B' },
  shopping: { label: 'Shopping', color: '#EC4899' },
  museum:   { label: 'Museum',   color: '#A855F7' },
  other:    { label: 'Other',    color: '#64748B' },
}

export const PLACE_CATEGORY_KEYS = Object.keys(PLACE_CATEGORIES)

export function categoryMeta(key) {
  return PLACE_CATEGORIES[key] ?? PLACE_CATEGORIES.other
}
```

Create `src/lib/suggestionTypes.js`:

```js
import { PLACE_CATEGORIES, PLACE_CATEGORY_KEYS } from './placeCategories'

// The add-form "type" selector. Each type maps a chosen chip to a save target + identity.
export const SUGGESTION_TYPES = [
  ...PLACE_CATEGORY_KEYS.map((key) => ({
    key,
    label: PLACE_CATEGORIES[key].label,
    color: PLACE_CATEGORIES[key].color,
    target: 'plan_items',
    kind: 'place',
    category: key,
  })),
  { key: 'stay', label: 'Stay', color: '#22C55E', target: 'plan_items', kind: 'hostel', category: null },
  { key: 'transport', label: 'Transport', color: '#14B8A6', target: 'transport', kind: null, category: null },
]

export function suggestionType(key) {
  return SUGGESTION_TYPES.find((t) => t.key === key) ?? null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/placeCategories.test.js src/lib/suggestionTypes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/placeCategories.js src/lib/placeCategories.test.js src/lib/suggestionTypes.js src/lib/suggestionTypes.test.js
git commit -m "feat: add place-category + suggestion-type config (single source of truth)"
```

---

## Task 3: Pure helpers — `lib/planItems.js`

**Files:**
- Create: `src/lib/planItems.js`, `src/lib/planItems.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/planItems.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  availabilityMatches, availabilityLabel, blankSuggestionForm,
  planItemToForm, formToPlanItem, planItemTypeKey,
} from './planItems'

const place = {
  kind: 'place', category: 'museum', title: 'Museum',
  avail_days: [0, 2, 3, 4, 5, 6], avail_open: '09:30:00', avail_close: '17:00:00',
  avail_start_date: null, avail_end_date: null,
}

describe('availabilityMatches', () => {
  it('passes when no date filter is set', () => {
    expect(availabilityMatches(place, '', '')).toBe(true)
  })
  it('fails on a closed weekday (Monday) and passes on an open one (Tuesday)', () => {
    expect(availabilityMatches(place, '2026-07-06', '')).toBe(false) // Mon
    expect(availabilityMatches(place, '2026-07-07', '')).toBe(true)  // Tue
  })
  it('respects open/close time when a time is given', () => {
    expect(availabilityMatches(place, '2026-07-07', '10:00')).toBe(true)
    expect(availabilityMatches(place, '2026-07-07', '18:00')).toBe(false)
  })
  it('respects an optional date window', () => {
    const evt = { ...place, avail_days: [0,1,2,3,4,5,6], avail_start_date: '2026-07-08', avail_end_date: '2026-07-09' }
    expect(availabilityMatches(evt, '2026-07-07', '')).toBe(false)
    expect(availabilityMatches(evt, '2026-07-08', '')).toBe(true)
  })
  it('non-place kinds always pass', () => {
    expect(availabilityMatches({ kind: 'hostel' }, '2026-07-06', '10:00')).toBe(true)
  })
})

describe('availabilityLabel', () => {
  it('summarises days + hours; empty for non-place', () => {
    expect(availabilityLabel({ kind:'place', avail_days:[0,1,2,3,4,5,6], avail_open:'06:00:00', avail_close:'17:00:00' }))
      .toBe('Daily · 06:00–17:00')
    expect(availabilityLabel({ kind:'place', avail_days:[0], avail_open:'09:00:00', avail_close:'16:00:00' }))
      .toBe('Sun · 09:00–16:00')
    expect(availabilityLabel({ kind:'hostel' })).toBe('')
  })
})

describe('form <-> row mappers', () => {
  it('blank form carries the type key and empty fields', () => {
    const f = blankSuggestionForm('meal')
    expect(f.typeKey).toBe('meal')
    expect(f.title).toBe('')
    expect(f.availDays).toEqual([])
  })
  it('formToPlanItem maps a place form to a snake_case row', () => {
    const f = { ...blankSuggestionForm('museum'), title: 'TNM', location: 'Ueno',
      availDays: [2,3], availOpen: '09:30', availClose: '17:00' }
    expect(formToPlanItem(f)).toMatchObject({
      kind: 'place', category: 'museum', title: 'TNM', location: 'Ueno',
      avail_days: [2,3], avail_open: '09:30', avail_close: '17:00',
      check_in_date: null, status: 'pending',
    })
  })
  it('formToPlanItem maps a stay form with check-in/out and null availability', () => {
    const f = { ...blankSuggestionForm('stay'), title: 'Sakura', location: 'Asakusa', checkIn: '2026-07-03', checkOut: '2026-07-10' }
    expect(formToPlanItem(f)).toMatchObject({
      kind: 'hostel', category: null, check_in_date: '2026-07-03', check_out_date: '2026-07-10', avail_days: null,
    })
  })
  it('planItemToForm round-trips a row back into a form', () => {
    const row = { id: 'p1', kind:'place', category:'meal', title:'Ichiran', location:'Shibuya',
      link:null, description:null, price_range:'¥', avail_days:[0], avail_open:'11:00:00', avail_close:'23:00:00',
      avail_start_date:null, avail_end_date:null, check_in_date:null, check_out_date:null }
    const f = planItemToForm(row)
    expect(f).toMatchObject({ id:'p1', typeKey:'meal', title:'Ichiran', availDays:[0], availOpen:'11:00', availClose:'23:00' })
  })
  it('planItemTypeKey derives the type chip from a row', () => {
    expect(planItemTypeKey({ kind:'hostel' })).toBe('stay')
    expect(planItemTypeKey({ kind:'place', category:'visit' })).toBe('visit')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/planItems.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/planItems.js`:

```js
import { suggestionType } from './suggestionTypes'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

// Does a plan item's availability include the given date/time? Non-place kinds always pass.
export function availabilityMatches(item, dateStr, timeStr) {
  if (!dateStr) return true
  if (item.kind !== 'place') return true
  if (item.avail_start_date && dateStr < item.avail_start_date) return false
  if (item.avail_end_date && dateStr > item.avail_end_date) return false
  const days = item.avail_days ?? []
  const wd = new Date(dateStr + 'T00:00').getDay()
  if (days.length && !days.includes(wd)) return false
  if (timeStr && item.avail_open && item.avail_close) {
    return timeStr >= hhmm(item.avail_open) && timeStr <= hhmm(item.avail_close)
  }
  return true
}

// Short human label of a place's opening hours; '' for non-place kinds.
export function availabilityLabel(item) {
  if (item.kind !== 'place') return ''
  const days = (item.avail_days ?? []).slice().sort((a, b) => a - b)
  let dayPart = ''
  if (days.length === 7) dayPart = 'Daily'
  else if (days.length) dayPart = days.map((d) => DAY_ABBR[d]).join(', ')
  const time = item.avail_open && item.avail_close ? `${hhmm(item.avail_open)}–${hhmm(item.avail_close)}` : ''
  return [dayPart, time].filter(Boolean).join(' · ')
}

// A fresh editor form for a chosen suggestion type.
export function blankSuggestionForm(typeKey) {
  return {
    id: undefined, typeKey,
    title: '', location: '', link: '', description: '', priceRange: '',
    availDays: [], availOpen: '', availClose: '', availStart: '', availEnd: '',
    checkIn: '', checkOut: '',
    method: 'train', from: '', to: '', reference: '', note: '',
  }
}

// The type chip a stored plan_items row belongs to.
export function planItemTypeKey(row) {
  return row.kind === 'hostel' ? 'stay' : row.category
}

// plan_items row (snake_case) -> editor form.
export function planItemToForm(row) {
  return {
    ...blankSuggestionForm(planItemTypeKey(row)),
    id: row.id,
    title: row.title ?? '',
    location: row.location ?? '',
    link: row.link ?? '',
    description: row.description ?? '',
    priceRange: row.price_range ?? '',
    availDays: row.avail_days ?? [],
    availOpen: hhmm(row.avail_open),
    availClose: hhmm(row.avail_close),
    availStart: row.avail_start_date ?? '',
    availEnd: row.avail_end_date ?? '',
    checkIn: row.check_in_date ?? '',
    checkOut: row.check_out_date ?? '',
  }
}

// editor form -> plan_items row fields (snake_case). Caller adds trip_id/created_by on insert.
export function formToPlanItem(form) {
  const t = suggestionType(form.typeKey)
  const isPlace = t.kind === 'place'
  const trim = (v) => (v.trim() ? v.trim() : null)
  return {
    ...(form.id ? { id: form.id } : {}),
    kind: t.kind,
    category: t.category,
    title: form.title.trim(),
    location: trim(form.location),
    link: trim(form.link),
    description: trim(form.description),
    price_range: trim(form.priceRange),
    avail_days: isPlace ? form.availDays : null,
    avail_open: isPlace ? form.availOpen || null : null,
    avail_close: isPlace ? form.availClose || null : null,
    avail_start_date: isPlace ? form.availStart || null : null,
    avail_end_date: isPlace ? form.availEnd || null : null,
    check_in_date: t.kind === 'hostel' ? form.checkIn || null : null,
    check_out_date: t.kind === 'hostel' ? form.checkOut || null : null,
    status: 'pending',
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/planItems.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planItems.js src/lib/planItems.test.js
git commit -m "feat: add planItems pure helpers (availability + form/row mappers)"
```

---

## Task 4: `useUpsertPlanItem` hook

**Files:**
- Create: `src/hooks/useUpsertPlanItem.js`, `src/hooks/useUpsertPlanItem.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useUpsertPlanItem.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { single, eq, insert, update, from } = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const insert = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, update }))
  return { single, select, eq, insert, update, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpsertPlanItem } from './useUpsertPlanItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

const item = { kind: 'place', category: 'meal', title: 'Ichiran', status: 'pending' }

describe('useUpsertPlanItem', () => {
  it('inserts a new item with trip_id + created_by', async () => {
    single.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const { result } = renderHook(() => useUpsertPlanItem('t1'), { wrapper })
    result.current.mutate({ ...item, createdBy: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('plan_items')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', created_by: 'm1', title: 'Ichiran' }))
  })
  it('updates an existing item (with id), without trip_id/created_by', async () => {
    single.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const { result } = renderHook(() => useUpsertPlanItem('t1'), { wrapper })
    result.current.mutate({ ...item, id: 'p1', createdBy: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ created_by: expect.anything() }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ichiran' }))
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useUpsertPlanItem.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/hooks/useUpsertPlanItem.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertPlanItem(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item) => {
      const { id, createdBy, ...fields } = item
      const query = id
        ? supabase.from('plan_items').update(fields).eq('id', id)
        : supabase.from('plan_items').insert({ ...fields, trip_id: tripId, created_by: createdBy ?? null })
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useUpsertPlanItem.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUpsertPlanItem.js src/hooks/useUpsertPlanItem.test.jsx
git commit -m "feat: add useUpsertPlanItem mutation"
```

---

## Task 5: `useDeletePlanItem` hook

**Files:**
- Create: `src/hooks/useDeletePlanItem.js`, `src/hooks/useDeletePlanItem.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useDeletePlanItem.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useDeletePlanItem } from './useDeletePlanItem'

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useDeletePlanItem', () => {
  it('deletes by id', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeletePlanItem('t1'), { wrapper })
    result.current.mutate('p1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('plan_items')
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useDeletePlanItem.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/hooks/useDeletePlanItem.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useDeletePlanItem(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('plan_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useDeletePlanItem.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDeletePlanItem.js src/hooks/useDeletePlanItem.test.jsx
git commit -m "feat: add useDeletePlanItem mutation"
```

---

## Task 6: Generalize `useUpsertTransport` for local legs

**Files:**
- Modify: `src/hooks/useUpsertTransport.js`
- Modify: `src/hooks/useUpsertTransport.test.jsx` (append a local-leg test)

- [ ] **Step 1: Append the failing test**

Append inside the `describe('useUpsertTransport', …)` block in `src/hooks/useUpsertTransport.test.jsx`:

```jsx
  it('inserts a local leg with category=local, null direction, and a note', async () => {
    single.mockResolvedValue({ data: { id: 'l1' }, error: null })
    const { result } = renderHook(() => useUpsertTransport('t1'), { wrapper })
    result.current.mutate({
      category: 'local', direction: null, method: 'subway',
      from: 'Asakusa Stn', to: 'Shibuya Stn', reference: 'Ginza line', note: '~30 min', createdBy: 'm1',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      category: 'local', direction: null, method: 'subway',
      from_text: 'Asakusa Stn', to_text: 'Shibuya Stn', reference: 'Ginza line', note: '~30 min', created_by: 'm1',
    }))
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useUpsertTransport.test.jsx`
Expected: FAIL — the new test sees `category: 'journey'` and no `note`.

- [ ] **Step 3: Update the implementation**

In `src/hooks/useUpsertTransport.js`, replace the `row` object with:

```js
      const row = {
        trip_id: tripId,
        category: leg.category || 'journey',
        direction: leg.direction ?? null,
        method: leg.method,
        depart_date: leg.departDate || null,
        depart_time: leg.departTime || null,
        from_text: leg.from,
        to_text: leg.to,
        reference: leg.reference || null,
        note: leg.note || null,
      }
```

(The insert/update branching and `created_by` handling below it stay unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useUpsertTransport.test.jsx`
Expected: PASS (the original journey tests + the new local test; `category` defaults to `journey` when omitted, so the old tests still hold).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUpsertTransport.js src/hooks/useUpsertTransport.test.jsx
git commit -m "feat: generalize useUpsertTransport for local legs (category + note)"
```

---

## Task 7: Embed `plan_items` in `useTrip`

**Files:**
- Modify: `src/hooks/useTrip.js`
- Modify: `src/hooks/useTrip.test.jsx` (add an assertion)

- [ ] **Step 1: Add the failing assertion**

In `src/hooks/useTrip.test.jsx`, inside the `'fetches one trip with members + transport'` test, add after the existing `select` assertion:

```jsx
    expect(select).toHaveBeenCalledWith(expect.stringContaining('plan_items'))
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useTrip.test.jsx`
Expected: FAIL — select string has no `plan_items`.

- [ ] **Step 3: Update the select**

In `src/hooks/useTrip.js`, replace the `TRIP_SELECT` constant with:

```js
const TRIP_SELECT =
  '*, trip_members(id, user_id, display_name, role, invite_status, profiles(display_name, avatar_url)), transport(*), plan_items(*)'
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useTrip.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTrip.js src/hooks/useTrip.test.jsx
git commit -m "feat: embed plan_items in the useTrip select"
```

---

## Task 8: `SuggestionCard` — flip card

**Files:**
- Create: `src/components/SuggestionCard.jsx`, `.module.css`, `SuggestionCard.test.jsx`

The card is presentational: it receives a pre-built `card` view-model (built by the backlog in Task 10) so it stays dumb and testable. Both faces render in the DOM at all times (flip is CSS); tap toggles `flipped` for touch, press forces the front (for the #3b drag).

- [ ] **Step 1: Write the failing test**

Create `src/components/SuggestionCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestionCard } from './SuggestionCard'

const card = {
  key: 'p1', title: 'Ichiran Ramen', pillLabel: 'Meal', color: '#F59E0B',
  availLabel: 'Daily · 11:00–23:00', showAvail: true, matches: true, createdByName: 'Ana',
  rows: [{ k: 'Location', v: 'Shibuya' }, { k: 'Price', v: '¥1,000–2,000' }],
}

describe('SuggestionCard', () => {
  it('renders front (name, pill, availability, creator) and back (detail rows)', () => {
    render(<SuggestionCard card={card} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Ichiran Ramen')).toBeInTheDocument()
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText(/Daily · 11:00–23:00/)).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Shibuya')).toBeInTheDocument()
  })
  it('hides the availability line when not filtering', () => {
    render(<SuggestionCard card={{ ...card, showAvail: false }} canEdit={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByText(/Daily · 11:00–23:00/)).not.toBeInTheDocument()
  })
  it('shows edit/remove only for editors and fires the handlers', async () => {
    const onEdit = vi.fn(); const onRemove = vi.fn()
    const { rerender } = render(<SuggestionCard card={card} canEdit={false} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    rerender(<SuggestionCard card={card} canEdit onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onEdit).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/SuggestionCard.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/SuggestionCard.jsx`:

```jsx
import { useState } from 'react'
import { initials } from '../lib/display'
import styles from './SuggestionCard.module.css'

export function SuggestionCard({ card, canEdit, onEdit, onRemove }) {
  const [flipped, setFlipped] = useState(false)
  const [pressing, setPressing] = useState(false)

  const cls = [styles.flip, card.matches ? '' : styles.dim, flipped ? styles.flipped : '', pressing ? styles.pressing : '']
    .filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      onClick={() => setFlipped((f) => !f)}
      onPointerDown={() => setPressing(true)}
      onPointerUp={() => setPressing(false)}
      onPointerCancel={() => setPressing(false)}
      onPointerLeave={() => setPressing(false)}
    >
      <div className={styles.inner}>
        <div className={`${styles.face} ${styles.front}`}>
          <span className={styles.stripe} style={{ background: card.color }} />
          <div className={styles.fbody}>
            <p className={styles.nm}>{card.title}</p>
            <span className={styles.pill} style={{ background: card.color }}>{card.pillLabel}</span>
            {card.showAvail && card.availLabel && <span className={styles.avail}>🕒 {card.availLabel}</span>}
            <span className={styles.who}>
              <span className={styles.av} style={{ background: card.color }}>{initials(card.createdByName)}</span>
              {card.createdByName}
            </span>
          </div>
        </div>
        <div className={`${styles.face} ${styles.back}`}>
          <span className={styles.btop} style={{ background: card.color }} />
          <div className={styles.bbody}>
            {card.availLabel && (
              <div className={styles.row}><span className={styles.k}>Available</span><span>🕒 {card.availLabel}</span></div>
            )}
            {card.rows.map((r) => (
              <div key={r.k} className={styles.row}><span className={styles.k}>{r.k}</span><span>{r.v}</span></div>
            ))}
          </div>
          {canEdit && (
            <div className={styles.acts}>
              <button type="button" className={styles.ibtn}
                onClick={(e) => { e.stopPropagation(); onEdit() }}>✎ Edit</button>
              <button type="button" className={styles.ibtn}
                onClick={(e) => { e.stopPropagation(); onRemove() }}>✕ Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/SuggestionCard.module.css`:

```css
.flip { perspective: 1000px; height: 132px; }
.flip.dim { opacity: 0.32; }
.inner { position: relative; width: 100%; height: 100%; transition: transform 0.45s; transform-style: preserve-3d; cursor: grab; }
.flip:hover .inner, .flip.flipped .inner { transform: rotateY(180deg); }
.flip.pressing .inner { transform: rotateY(0deg) !important; cursor: grabbing; }
@media (prefers-reduced-motion: reduce) {
  .inner { transition: opacity 0.2s; transform: none !important; }
  .back { opacity: 0; }
  .flip:hover .back, .flip.flipped .back { opacity: 1; }
  .flip:hover .front, .flip.flipped .front { opacity: 0; }
}
.face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: 0 3px 10px rgba(15,23,42,0.06); overflow: hidden; display: flex; }
.front .stripe, .stripe { width: 5px; flex: none; }
.fbody { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; min-width: 0; }
.nm { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0 0 6px; line-height: 1.2; }
.pill { display: inline-block; width: fit-content; font-size: 9px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; padding: 2px 8px; border-radius: 999px; }
.avail { display: block; width: fit-content; font-size: 10px; font-weight: 600; color: #0f766e; background: #f0fdfa; border-radius: 5px; padding: 2px 6px; margin-top: 6px; }
.who { margin-top: auto; display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--ink-muted); }
.av { width: 17px; height: 17px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 700; display: grid; place-items: center; }
.back { transform: rotateY(180deg); flex-direction: column; }
.btop { height: 4px; width: 100%; flex: none; }
.bbody { padding: 9px 12px; overflow-y: auto; flex: 1; font-size: 11px; color: var(--ink-muted); line-height: 1.55; }
.row { display: flex; gap: 6px; margin-top: 4px; }
.row:first-child { margin-top: 0; }
.k { font-weight: 700; color: #334155; min-width: 58px; flex: none; }
.acts { display: flex; gap: 8px; justify-content: flex-end; padding: 5px 10px; border-top: 1px solid #f1f5f9; flex: none; }
.ibtn { font-size: 11px; color: var(--ink-muted); background: none; border: none; cursor: pointer; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/SuggestionCard.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/SuggestionCard.jsx src/components/SuggestionCard.module.css src/components/SuggestionCard.test.jsx
git commit -m "feat: add SuggestionCard flip card"
```

---

## Task 9: `SuggestionEditorModal` — adaptive add/edit form

**Files:**
- Create: `src/components/SuggestionEditorModal.jsx`, `.module.css`, `SuggestionEditorModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/SuggestionEditorModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useUpsertPlanItem', () => ({ useUpsertPlanItem: vi.fn() }))
vi.mock('../hooks/useUpsertTransport', () => ({ useUpsertTransport: vi.fn() }))

import { useUpsertPlanItem } from '../hooks/useUpsertPlanItem'
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import { SuggestionEditorModal } from './SuggestionEditorModal'

beforeEach(() => {
  vi.clearAllMocks()
  useUpsertPlanItem.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useUpsertTransport.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

function open(props) {
  render(<SuggestionEditorModal tripId="t1" memberId="m1" initialType="visit" onClose={vi.fn()} {...props} />)
}

describe('SuggestionEditorModal', () => {
  it('blocks a place save when required fields are missing', async () => {
    const mutate = vi.fn()
    useUpsertPlanItem.mockReturnValue({ mutate, isPending: false })
    open()
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('saves a valid place to plan_items with mapped fields', async () => {
    const mutate = vi.fn()
    useUpsertPlanItem.mockReturnValue({ mutate, isPending: false })
    open()
    await userEvent.type(screen.getByLabelText(/^name/i), 'Senso-ji')
    await userEvent.type(screen.getByLabelText(/location/i), 'Asakusa')
    await userEvent.click(screen.getByRole('button', { name: /^mon$/i }))
    fireEvent.change(screen.getByLabelText(/open/i), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText(/close/i), { target: { value: '17:00' } })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'place', category: 'visit', title: 'Senso-ji', location: 'Asakusa', createdBy: 'm1' }),
      expect.any(Object),
    )
  })

  it('switches to Transport and saves a local leg to the transport table', async () => {
    const mutate = vi.fn()
    useUpsertTransport.mockReturnValue({ mutate, isPending: false })
    open()
    await userEvent.type(screen.getByLabelText(/^name/i), 'Subway hop')
    await userEvent.click(screen.getByRole('button', { name: /^transport$/i }))
    await userEvent.type(screen.getByLabelText(/from/i), 'Asakusa Stn')
    await userEvent.type(screen.getByLabelText(/^to/i), 'Shibuya Stn')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'local', direction: null, from: 'Asakusa Stn', to: 'Shibuya Stn', createdBy: 'm1' }),
      expect.any(Object),
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/SuggestionEditorModal.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/SuggestionEditorModal.jsx`:

```jsx
import { useState } from 'react'
import { Modal } from './Modal'
import { SUGGESTION_TYPES, suggestionType } from '../lib/suggestionTypes'
import { blankSuggestionForm, formToPlanItem, planItemToForm } from '../lib/planItems'
import { TRANSPORT_METHODS, METHOD_KEYS, methodMeta, rowToForm } from '../lib/transport'
import { useUpsertPlanItem } from '../hooks/useUpsertPlanItem'
import { useUpsertTransport } from '../hooks/useUpsertTransport'
import styles from './SuggestionEditorModal.module.css'

const DAYS = [
  { i: 1, l: 'Mon' }, { i: 2, l: 'Tue' }, { i: 3, l: 'Wed' }, { i: 4, l: 'Thu' },
  { i: 5, l: 'Fri' }, { i: 6, l: 'Sat' }, { i: 0, l: 'Sun' },
]

// Build the initial form: editing a plan item, editing a local transport leg, or a blank of initialType.
function initialForm({ planItem, transportLeg, initialType }) {
  if (planItem) return planItemToForm(planItem)
  if (transportLeg) return { ...blankSuggestionForm('transport'), ...rowToForm(transportLeg), typeKey: 'transport', note: transportLeg.note ?? '' }
  return blankSuggestionForm(initialType ?? 'visit')
}

export function SuggestionEditorModal({ tripId, memberId, onClose, planItem, transportLeg, initialType }) {
  const [form, setForm] = useState(() => initialForm({ planItem, transportLeg, initialType }))
  const [error, setError] = useState('')
  const upsertPlan = useUpsertPlanItem(tripId)
  const upsertTransport = useUpsertTransport(tripId)
  const t = suggestionType(form.typeKey)
  const pending = upsertPlan.isPending || upsertTransport.isPending
  const isEdit = !!form.id
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  const toggleDay = (i) => setForm((f) => ({ ...f, availDays: f.availDays.includes(i) ? f.availDays.filter((d) => d !== i) : [...f.availDays, i] }))

  function fail(msg) { setError(msg); return false }
  function validate() {
    if (!form.title.trim()) return fail('Name is required.')
    if (t.target === 'transport') {
      if (!form.method || !form.from.trim() || !form.to.trim()) return fail('Method, from and to are required.')
      return true
    }
    if (!form.location.trim()) return fail('Location is required.')
    if (t.kind === 'place') {
      if (!form.availDays.length || !form.availOpen || !form.availClose) return fail('Pick at least one open day and open/close times.')
    } else {
      if (!form.checkIn || !form.checkOut) return fail('Check-in and check-out dates are required.')
      if (form.checkOut < form.checkIn) return fail('Check-out must be on or after check-in.')
    }
    return true
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setError('')
    const onDone = { onSuccess: onClose, onError: () => setError('Could not save. Please try again.') }
    if (t.target === 'transport') {
      upsertTransport.mutate({
        ...(form.id ? { id: form.id } : {}),
        category: 'local', direction: null, method: form.method,
        from: form.from.trim(), to: form.to.trim(),
        reference: methodMeta(form.method).ref ? form.reference.trim() : '',
        note: form.note.trim(), createdBy: memberId,
      }, onDone)
    } else {
      upsertPlan.mutate({ ...formToPlanItem(form), createdBy: memberId }, onDone)
    }
  }

  const meta = methodMeta(form.method)

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit suggestion' : 'Add a suggestion'}>
      <form className={styles.pass} noValidate onSubmit={handleSubmit}>
        <div className={styles.colbar} style={{ background: t.color }} />
        <div className={styles.pad}>
          <p className={styles.ey}>{isEdit ? 'EDIT SUGGESTION' : 'NEW SUGGESTION'}</p>

          <label className={styles.label} htmlFor="s-name">Name</label>
          <input id="s-name" className={styles.input} value={form.title} onChange={set('title')} />

          <span className={styles.label} id="type-label">Type</span>
          <div className={styles.chips} role="group" aria-labelledby="type-label">
            {SUGGESTION_TYPES.map((st) => (
              <button key={st.key} type="button"
                className={`${styles.chip} ${form.typeKey === st.key ? styles.chipOn : ''}`}
                style={form.typeKey === st.key ? { borderColor: st.color, color: st.color } : undefined}
                aria-pressed={form.typeKey === st.key}
                onClick={() => { setForm((f) => ({ ...f, typeKey: st.key })); setError('') }}>
                {st.label}
              </button>
            ))}
          </div>

          {t.target === 'transport' ? (
            <>
              <span className={styles.label} id="m-label">Method</span>
              <div className={styles.chips} role="group" aria-labelledby="m-label">
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
                  <label className={styles.label} htmlFor="s-from">{meta.from}</label>
                  <input id="s-from" className={styles.input} value={form.from} onChange={set('from')} />
                </div>
                <div className={styles.col}>
                  <label className={styles.label} htmlFor="s-to">{meta.to}</label>
                  <input id="s-to" className={styles.input} value={form.to} onChange={set('to')} />
                </div>
              </div>
              {meta.ref && (
                <>
                  <label className={styles.label} htmlFor="s-ref">{meta.ref} · optional</label>
                  <input id="s-ref" className={styles.input} value={form.reference} onChange={set('reference')} />
                </>
              )}
              <label className={styles.label} htmlFor="s-note">Note · optional</label>
              <input id="s-note" className={styles.input} value={form.note} onChange={set('note')} />
            </>
          ) : (
            <>
              <label className={styles.label} htmlFor="s-loc">Location</label>
              <input id="s-loc" className={styles.input} value={form.location} onChange={set('location')} />
              <label className={styles.label} htmlFor="s-link">Website / link · optional</label>
              <input id="s-link" className={styles.input} placeholder="place some social media info here" value={form.link} onChange={set('link')} />
              <label className={styles.label} htmlFor="s-desc">Description · optional</label>
              <input id="s-desc" className={styles.input} placeholder="fill in description/purpose to let others know more" value={form.description} onChange={set('description')} />
              <label className={styles.label} htmlFor="s-price">Price range · optional</label>
              <input id="s-price" className={styles.input} value={form.priceRange} onChange={set('priceRange')} />

              {t.kind === 'place' ? (
                <>
                  <span className={styles.label} id="days-label">Open days</span>
                  <div className={styles.chips} role="group" aria-labelledby="days-label">
                    {DAYS.map((d) => (
                      <button key={d.i} type="button"
                        className={`${styles.chip} ${form.availDays.includes(d.i) ? styles.chipOn : ''}`}
                        aria-pressed={form.availDays.includes(d.i)}
                        onClick={() => toggleDay(d.i)}>{d.l}</button>
                    ))}
                  </div>
                  <div className={styles.row}>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-open">Open</label>
                      <input id="s-open" type="time" className={styles.input} value={form.availOpen} onChange={set('availOpen')} />
                    </div>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-close">Close</label>
                      <input id="s-close" type="time" className={styles.input} value={form.availClose} onChange={set('availClose')} />
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-astart">Only from · optional</label>
                      <input id="s-astart" type="date" className={styles.input} value={form.availStart} onChange={set('availStart')} />
                    </div>
                    <div className={styles.col}>
                      <label className={styles.label} htmlFor="s-aend">Only until · optional</label>
                      <input id="s-aend" type="date" className={styles.input} value={form.availEnd} onChange={set('availEnd')} />
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.row}>
                  <div className={styles.col}>
                    <label className={styles.label} htmlFor="s-in">Check-in</label>
                    <input id="s-in" type="date" className={styles.input} value={form.checkIn} onChange={set('checkIn')} />
                  </div>
                  <div className={styles.col}>
                    <label className={styles.label} htmlFor="s-out">Check-out</label>
                    <input id="s-out" type="date" className={styles.input} value={form.checkOut} onChange={set('checkOut')} />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={pending}>
              {pending ? 'Saving…' : 'Save suggestion'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/SuggestionEditorModal.module.css`:

```css
.pass { display: flex; background: #fff; border-radius: var(--radius-lg, 16px); overflow: hidden; width: min(460px, 94vw); max-height: 88vh; }
.colbar { flex: none; width: 8px; }
.pad { flex: 1; padding: var(--space-5); overflow-y: auto; }
.ey { margin: 0 0 var(--space-3); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; color: var(--ink-muted); }
.label { display: block; margin: var(--space-3) 0 var(--space-1); font-size: 13px; font-weight: 600; color: var(--ink); }
.input { width: 100%; box-sizing: border-box; padding: var(--space-2) var(--space-3); font-size: 14px; border: 1.5px solid var(--border); border-radius: var(--radius-md); background: #fff; }
.input::placeholder { color: #cbd5e1; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { padding: var(--space-1) var(--space-3); font-size: 13px; font-weight: 600; border: 1.5px solid var(--border); border-radius: 999px; background: transparent; color: var(--ink); }
.chipOn { border-color: var(--primary); color: var(--primary-strong); background: var(--c-mist); }
.row { display: flex; gap: var(--space-3); }
.col { flex: 1; }
.error { margin: var(--space-3) 0 0; font-size: 13px; color: #dc2626; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-5); }
.cancel { padding: var(--space-2) var(--space-4); font-weight: 600; background: transparent; border: 1.5px solid var(--border); border-radius: var(--radius-md); color: var(--ink); }
.submit { padding: var(--space-2) var(--space-4); font-weight: 600; background: var(--primary); border: 1.5px solid var(--primary); border-radius: var(--radius-md); color: #fff; }
.submit:disabled { opacity: 0.5; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/SuggestionEditorModal.test.jsx`
Expected: PASS (3 tests).

Note: the place-save test types into "Open"/"Close" time inputs and clicks the "Mon" day chip; the transport test switches type then fills From/To. The `getByLabelText(/^to/i)` uses an anchored match so it doesn't collide with other labels.

- [ ] **Step 6: Commit**

```bash
git add src/components/SuggestionEditorModal.jsx src/components/SuggestionEditorModal.module.css src/components/SuggestionEditorModal.test.jsx
git commit -m "feat: add adaptive SuggestionEditorModal"
```

---

## Task 10: `PlanningBacklog` — filter + grouped sections

**Files:**
- Create: `src/components/PlanningBacklog.jsx`, `.module.css`, `PlanningBacklog.test.jsx`

Builds card view-models from `trip.plan_items` (places/stays) and `trip.transport` (locals), groups them, and renders the availability filter + `SuggestionCard`s.

- [ ] **Step 1: Write the failing test**

Create `src/components/PlanningBacklog.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./SuggestionCard', () => ({
  SuggestionCard: ({ card, canEdit }) => (
    <div data-testid="card" data-dim={!card.matches}>
      {card.title}{canEdit ? ' [edit]' : ''}
    </div>
  ),
}))
import { PlanningBacklog } from './PlanningBacklog'

const trip = {
  id: 't1', start_date: '2026-07-03', end_date: '2026-07-10',
  trip_members: [{ id: 'm1', user_id: 'u1', role: 'host', profiles: { display_name: 'Ana' } }],
  plan_items: [
    { id: 'p1', kind: 'place', category: 'museum', title: 'TNM', avail_days: [2,3,4,5,6,0], avail_open: '09:30:00', avail_close: '17:00:00', created_by: 'm1' },
    { id: 'p2', kind: 'hostel', title: 'Sakura Hostel', created_by: 'm1' },
  ],
  transport: [
    { id: 'l1', category: 'local', method: 'subway', from_text: 'A', to_text: 'B', created_by: 'm1' },
    { id: 'j1', category: 'journey', method: 'flight', from_text: 'KUL', to_text: 'HND' },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('PlanningBacklog', () => {
  it('groups items and excludes journey transport', () => {
    render(<PlanningBacklog trip={trip} canEdit={false} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('TNM')).toBeInTheDocument()          // Places
    expect(screen.getByText('Sakura Hostel')).toBeInTheDocument() // Stays
    expect(screen.getByText(/^A → B/)).toBeInTheDocument()        // Local transport
    expect(screen.queryByText(/KUL/)).not.toBeInTheDocument()     // journey excluded
  })

  it('clamps the date filter to the trip window and dims closed places', async () => {
    render(<PlanningBacklog trip={trip} canEdit={false} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    const date = screen.getByLabelText(/available on/i)
    expect(date).toHaveAttribute('min', '2026-07-03')
    expect(date).toHaveAttribute('max', '2026-07-10')
    fireEvent.change(date, { target: { value: '2026-07-06' } }) // Monday — TNM (closed Mon) should dim
    const tnm = screen.getByText('TNM').closest('[data-testid="card"]')
    expect(tnm).toHaveAttribute('data-dim', 'true')
  })

  it('shows Add buttons only for editors', () => {
    const { rerender } = render(<PlanningBacklog trip={trip} canEdit={false} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
    rerender(<PlanningBacklog trip={trip} canEdit onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /add/i }).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/PlanningBacklog.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/PlanningBacklog.jsx`:

```jsx
import { useState } from 'react'
import { SuggestionCard } from './SuggestionCard'
import { categoryMeta } from '../lib/placeCategories'
import { availabilityMatches, availabilityLabel } from '../lib/planItems'
import { methodMeta } from '../lib/transport'
import styles from './PlanningBacklog.module.css'

const STAY_COLOR = '#22C55E'
const TRANSPORT_COLOR = '#14B8A6'

function memberName(trip, id) {
  const m = (trip.trip_members ?? []).find((x) => x.id === id)
  return m ? (m.profiles?.display_name ?? m.display_name ?? 'Guest') : '—'
}

function planItemCard(trip, item, date, time) {
  const isPlace = item.kind === 'place'
  const meta = isPlace ? categoryMeta(item.category) : { label: 'Stay', color: STAY_COLOR }
  const rows = [
    item.location && { k: 'Location', v: item.location },
    item.price_range && { k: 'Price', v: item.price_range },
    item.link && { k: 'Link', v: item.link },
    item.description && { k: 'Notes', v: item.description },
    item.check_in_date && { k: 'Check-in', v: item.check_in_date },
    item.check_out_date && { k: 'Check-out', v: item.check_out_date },
  ].filter(Boolean)
  const availLabel = availabilityLabel(item)
  return {
    key: item.id, source: 'plan', raw: item,
    title: item.title, pillLabel: meta.label, color: meta.color,
    availLabel, showAvail: !!date && !!availLabel,
    matches: availabilityMatches(item, date, time),
    createdByName: memberName(trip, item.created_by), rows,
  }
}

function transportCard(trip, leg) {
  const meta = methodMeta(leg.method)
  const rows = [
    { k: 'Route', v: `${leg.from_text} → ${leg.to_text}` },
    leg.reference && { k: 'Reference', v: leg.reference },
    leg.note && { k: 'Notes', v: leg.note },
  ].filter(Boolean)
  return {
    key: leg.id, source: 'transport', raw: leg,
    title: `${leg.from_text} → ${leg.to_text}`, pillLabel: meta.label, color: TRANSPORT_COLOR,
    availLabel: '', showAvail: false, matches: true,
    createdByName: memberName(trip, leg.created_by), rows,
  }
}

export function PlanningBacklog({ trip, canEdit, onAdd, onEdit, onRemove }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const items = trip.plan_items ?? []
  const locals = (trip.transport ?? []).filter((t) => t.category === 'local')

  const groups = [
    { key: 'places', icon: '📍', label: 'Places', addType: 'visit',
      cards: items.filter((i) => i.kind === 'place').map((i) => planItemCard(trip, i, date, time)) },
    { key: 'stays', icon: '🏨', label: 'Stays', addType: 'stay',
      cards: items.filter((i) => i.kind === 'hostel').map((i) => planItemCard(trip, i, date, time)) },
    { key: 'transport', icon: '🚆', label: 'Local transport', addType: 'transport',
      cards: locals.map((l) => transportCard(trip, l)) },
  ]

  return (
    <section>
      <div className={styles.bar}>
        <label className={styles.blabel} htmlFor="f-date">Available on</label>
        <input id="f-date" type="date" className={styles.binput} min={trip.start_date} max={trip.end_date}
          value={date} onChange={(e) => setDate(e.target.value)} />
        <label className={styles.blabel} htmlFor="f-time">at</label>
        <input id="f-time" type="time" className={styles.binput} value={time} onChange={(e) => setTime(e.target.value)} />
        {(date || time) && (
          <button type="button" className={styles.clear} onClick={() => { setDate(''); setTime('') }}>Clear filter</button>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.key} className={styles.group}>
          <div className={styles.head}>
            <span className={styles.gtitle}><span aria-hidden="true">{g.icon}</span> {g.label} ({g.cards.length})</span>
            {canEdit && <button type="button" className={styles.add} onClick={() => onAdd(g.addType)}>+ Add</button>}
          </div>
          {g.cards.length === 0 ? (
            <p className={styles.empty}>{canEdit ? `Add your first ${g.label.toLowerCase()}` : 'Nothing here yet'}</p>
          ) : (
            <div className={styles.grid}>
              {g.cards.map((card) => (
                <SuggestionCard key={card.key} card={card} canEdit={canEdit}
                  onEdit={() => onEdit(card.source, card.raw)} onRemove={() => onRemove(card.source, card.raw)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/PlanningBacklog.module.css`:

```css
.bar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; background: var(--c-mist); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-4); }
.blabel { font-size: 12px; font-weight: 700; color: var(--ink-muted); }
.binput { padding: var(--space-1) var(--space-2); font-size: 13px; border: 1.5px solid var(--border); border-radius: var(--radius-md); }
.clear { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--primary-strong); background: none; border: none; cursor: pointer; }
.group { margin-bottom: var(--space-5); }
.head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 var(--space-2); }
.gtitle { font-size: 13px; font-weight: 700; color: #334155; }
.add { font-size: 12px; font-weight: 600; color: var(--primary-strong); background: var(--c-mist); border: 1.5px solid var(--border); border-radius: var(--radius-md); padding: 4px 10px; }
.empty { margin: 0; font-size: 13px; color: var(--ink-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-3); }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/PlanningBacklog.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/PlanningBacklog.jsx src/components/PlanningBacklog.module.css src/components/PlanningBacklog.test.jsx
git commit -m "feat: add PlanningBacklog (filter + grouped sections)"
```

---

## Task 11: `Planning` page + route wiring

**Files:**
- Create: `src/pages/Planning.jsx`, `.module.css`, `Planning.test.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/Planning.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../components/PlanningBacklog', () => ({
  PlanningBacklog: ({ canEdit, onAdd }) => (
    <div>
      <span>Backlog</span>
      {canEdit && <span>canEdit</span>}
      <button type="button" onClick={() => onAdd('visit')}>add-proxy</button>
    </div>
  ),
}))
vi.mock('../components/SuggestionEditorModal', () => ({ SuggestionEditorModal: () => <div>EditorModal</div> }))
vi.mock('../hooks/useDeletePlanItem', () => ({ useDeletePlanItem: () => ({ mutate: vi.fn() }) }))
vi.mock('../hooks/useDeleteTransport', () => ({ useDeleteTransport: () => ({ mutate: vi.fn() }) }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { Planning } from './Planning'

const trip = {
  id: 't1', start_date: '2026-07-03', end_date: '2026-07-10',
  trip_members: [{ id: 'm1', user_id: 'u1', role: 'host', profiles: { display_name: 'Ana' } }],
  plan_items: [], transport: [],
}

function renderPlanning(t = trip) {
  return render(
    <MemoryRouter initialEntries={['/trip/t1/planning']}>
      <Routes>
        <Route path="/trip/:tripId" element={<Outlet context={{ trip: t }} />}>
          <Route path="planning" element={<Planning />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
beforeEach(() => vi.clearAllMocks())

describe('Planning', () => {
  it('renders the backlog with edit rights for a host', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('canEdit')).toBeInTheDocument()
  })
  it('opens the editor from an add action', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning()
    await userEvent.click(screen.getByRole('button', { name: /add-proxy/i }))
    expect(screen.getByText('EditorModal')).toBeInTheDocument()
  })
  it('is read-only for a viewer', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' } })
    renderPlanning({ ...trip, trip_members: [{ id: 'm1', user_id: 'u1', role: 'viewer' }] })
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.queryByText('canEdit')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/Planning.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

Create `src/pages/Planning.jsx`:

```jsx
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { PlanningBacklog } from '../components/PlanningBacklog'
import { SuggestionEditorModal } from '../components/SuggestionEditorModal'
import { useDeletePlanItem } from '../hooks/useDeletePlanItem'
import { useDeleteTransport } from '../hooks/useDeleteTransport'
import styles from './Planning.module.css'

export function Planning() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)
  const [editor, setEditor] = useState(null) // { initialType } | { planItem } | { transportLeg }
  const delPlan = useDeletePlanItem(trip.id)
  const delTransport = useDeleteTransport(trip.id)

  function handleEdit(source, raw) {
    setEditor(source === 'transport' ? { transportLeg: raw } : { planItem: raw })
  }
  function handleRemove(source, raw) {
    if (!window.confirm('Remove this suggestion?')) return
    if (source === 'transport') delTransport.mutate(raw.id)
    else delPlan.mutate(raw.id)
  }

  return (
    <section className={styles.wrap}>
      <PlanningBacklog trip={trip} canEdit={canEdit}
        onAdd={(type) => setEditor({ initialType: type })}
        onEdit={handleEdit} onRemove={handleRemove} />
      {editor && (
        <SuggestionEditorModal
          tripId={trip.id} memberId={me?.id ?? null}
          initialType={editor.initialType}
          planItem={editor.planItem} transportLeg={editor.transportLeg}
          onClose={() => setEditor(null)} />
      )}
    </section>
  )
}
```

Create `src/pages/Planning.module.css`:

```css
.wrap { max-width: 1000px; }
```

- [ ] **Step 4: Wire the route**

In `src/App.jsx`: add the import next to the other page imports:

```jsx
import { Planning } from './pages/Planning'
```

and replace this line:

```jsx
                    <Route path="planning" element={<ComingSoon section="Planning" />} />
```

with:

```jsx
                    <Route path="planning" element={<Planning />} />
```

(Leave the `ComingSoon` import — it's still used by packing/finance/discussion.)

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/pages/Planning.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Planning.jsx src/pages/Planning.module.css src/pages/Planning.test.jsx src/App.jsx
git commit -m "feat: add Planning page and wire the /planning route"
```

---

## Task 12: Full-suite check + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite + lint**

Run: `npm run test:run`
Expected: all suites PASS (existing + the new files). If "no tests" prints, re-run once.

Run: `npm run lint`
Expected: no errors. (Watch for unused vars in `vi.hoisted` mock blocks — remove any binding you don't reference, per the project's eslint config.)

- [ ] **Step 2: Manual smoke test**

With Task 1 SQL applied and `npm run dev` running, open a trip → **Planning** tab as host/editor:

1. **+ Add** in Places → pick a category (e.g. Museum) → fill name, location, open days + open/close → Save → card appears under Places; hover flips to details.
2. **+ Add** in Stays → Stay → name, location, check-in/out → Save → appears under Stays.
3. **+ Add** in Local transport → Transport → method + from/to (+ note) → Save → appears under Local transport.
4. Set the **Available on** filter to a date the museum is closed → its card dims; others unaffected; clear the filter.
5. Hover a card → flips to back; press-and-hold → shows front (drag affordance for #3b).
6. Edit (✎) a card → modal pre-filled → change → Save persists. Remove (✕) → confirm → card gone.
7. As a **viewer**, the Planning tab shows cards but no +Add / ✎ / ✕.

- [ ] **Step 3: RLS spot-checks (Supabase SQL editor)**

Verify in-app: a viewer sees no write affordances, and a direct client insert by a non-writer is rejected by RLS. A non-member cannot read another trip's `plan_items` (RLS returns no rows).

- [ ] **Step 4: Final commit (only if lint/format touch-ups were needed)**

```bash
git add -A
git commit -m "chore: #3a planning backlog — full-suite green + smoke-tested"
```

---

## Done — coverage against the spec

- §2 data model (`plan_items` + RLS, `transport.note`) → Task 1.
- §3 config (place categories + suggestion types) → Task 2.
- §4 data flow (extended `useTrip`, upsert/delete plan item, generalized transport upsert) → Tasks 4–7.
- §5 UI (Planning page, backlog + filter, flip card, adaptive editor, permissions) → Tasks 8–11.
- §6 validation → Task 9 (`validate`).
- §7 edge cases (viewer read-only, dim-not-hide, `created_by` null → "—", reduced motion) → Tasks 8, 10, 11.
- §9 testing → the test step in every task + Task 12 full-suite + RLS checks.
```
