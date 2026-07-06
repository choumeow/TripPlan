# Finance 5b — Budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Finance **📊 Budget** view real — host/editor-defined categories, each with a per-currency budget, shown as team-spend-vs-budget bars (model B), plus a per-currency totals roll-up.

**Architecture:** Pure computation in `lib/budget.js` (per-category/per-currency spend, uncategorized spend, totals) over data already embedded by `useTrip` (`budget_categories(*, category_budgets(*))` + team `expenses`). Three small hooks do category/budget writes against the tables + RLS that already exist from 5a — **no new DB objects**. The Budget view replaces the stub branch in `Finance.jsx`.

**Tech Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-finance-5b-budget-design.md`.

---

## File structure (5b — all new except the Finance page)

```
src/lib/budget.js + .test.js                     categoryRows / uncategorizedRows / budgetTotals + STARTER_CATEGORIES
src/hooks/useUpsertCategory.js + .test.jsx       category insert/update + per-currency budget upsert/delete
src/hooks/useDeleteCategory.js + .test.jsx       delete category by id
src/hooks/useSeedStarterCategories.js + .test.jsx  insert the 5 example categories (skip existing names)
src/components/BudgetCategory.jsx + .module.css + .test.jsx   one category card (per-currency sub-bars)
src/components/BudgetTotals.jsx + .module.css + .test.jsx     per-currency budgeted/spent/delta roll-up
src/components/CategoryEditorModal.jsx + .module.css + .test.jsx  name + Departure/Destination budget fields
src/components/BudgetView.jsx + .module.css + .test.jsx       list + uncategorized + totals + empty state
src/pages/Finance.jsx (modify) + Finance.test.jsx (modify)   budget branch → <BudgetView/> + editor/seed/delete wiring
```

Reuses: `formatMoney`/`currencyMeta` (`lib/currencies`), `Modal`, `callerMember`/`canWrite` (`lib/tripAccess`), design tokens. **No DB work** — tables/RLS/embed all landed in 5a.

**Harness note (every task):** vitest v4 here intermittently fails a fresh test file's FIRST run with a spurious "reading 'config'" / "no tests" error. Re-run the same `npx vitest run <file>` once or twice (space them out); only a real assertion diff counts. Run single files, not the whole suite (except the final task).

---

## Task 1: `lib/budget.js` — pure budget computation

**Files:** Create `src/lib/budget.js`, `src/lib/budget.test.js`.

- [ ] **Step 1: Write the failing test** — `src/lib/budget.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { categoryRows, uncategorizedRows, budgetTotals, STARTER_CATEGORIES } from './budget'

const cat = { id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }
const team = [
  { category_id: 'c1', currency: 'JPY', total_amount: 31000 },
  { category_id: 'c1', currency: 'MYR', total_amount: 50 },   // spend in a currency with no budget
  { category_id: null, currency: 'JPY', total_amount: 5000 }, // uncategorized
]

describe('categoryRows', () => {
  it('returns a row per budgeted-or-spent currency, budgeted first, with null budget when unset', () => {
    const rows = categoryRows(cat, team)
    expect(rows).toEqual([
      { currency: 'JPY', spent: 31000, budget: 40000 },
      { currency: 'MYR', spent: 50, budget: null },
    ])
  })
  it('is empty for a category with no budget and no spend', () => {
    expect(categoryRows({ id: 'c9', name: 'X', category_budgets: [] }, team)).toEqual([])
  })
})
describe('uncategorizedRows', () => {
  it('sums team spend with no category by currency', () => {
    expect(uncategorizedRows(team)).toEqual([{ currency: 'JPY', spent: 5000 }])
  })
})
describe('budgetTotals', () => {
  it('sums budgeted per currency and ALL team spend per currency, with delta', () => {
    const totals = budgetTotals([cat], team)
    expect(totals.JPY).toEqual({ budgeted: 40000, spent: 36000, delta: 4000 })
    expect(totals.MYR).toEqual({ budgeted: 0, spent: 50, delta: -50 })
  })
})
describe('STARTER_CATEGORIES', () => {
  it('is the five example names', () => {
    expect(STARTER_CATEGORIES).toEqual(['Hostel', 'Meal', 'Transport', 'Ticket', 'Photograph'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/budget.test.js` → FAIL (module missing).

- [ ] **Step 3: Write minimal implementation** — `src/lib/budget.js`:
```js
export const STARTER_CATEGORIES = ['Hostel', 'Meal', 'Transport', 'Ticket', 'Photograph']

// Rows for one category: one per currency it has a budget in OR has team spend in.
// Budgeted currencies come first (in their stored order), then spend-only currencies.
export function categoryRows(category, teamExpenses) {
  const budgets = new Map((category.category_budgets ?? []).map((b) => [b.currency, Number(b.amount)]))
  const spent = new Map()
  for (const e of teamExpenses ?? []) {
    if (e.category_id !== category.id) continue
    spent.set(e.currency, (spent.get(e.currency) ?? 0) + Number(e.total_amount))
  }
  const currencies = [...budgets.keys()]
  for (const c of spent.keys()) if (!budgets.has(c)) currencies.push(c)
  return currencies.map((currency) => ({
    currency,
    spent: spent.get(currency) ?? 0,
    budget: budgets.has(currency) ? budgets.get(currency) : null,
  }))
}

// Uncategorized team spend (category_id == null) per currency.
export function uncategorizedRows(teamExpenses) {
  const spent = new Map()
  for (const e of teamExpenses ?? []) {
    if (e.category_id != null) continue
    spent.set(e.currency, (spent.get(e.currency) ?? 0) + Number(e.total_amount))
  }
  return [...spent.entries()].map(([currency, s]) => ({ currency, spent: s }))
}

// Per-currency roll-up: total budgeted (all category budgets) vs total team spend (incl. uncategorized).
export function budgetTotals(categories, teamExpenses) {
  const out = {}
  const ensure = (c) => (out[c] ??= { budgeted: 0, spent: 0, delta: 0 })
  for (const cat of categories ?? []) for (const b of cat.category_budgets ?? []) ensure(b.currency).budgeted += Number(b.amount)
  for (const e of teamExpenses ?? []) ensure(e.currency).spent += Number(e.total_amount)
  for (const c of Object.keys(out)) out[c].delta = out[c].budgeted - out[c].spent
  return out
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/budget.test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/budget.js src/lib/budget.test.js
git commit -m "feat: pure budget computation (finance 5b)"
```

---

## Task 2: `useUpsertCategory`

Insert/update a `budget_categories` row, then per the two trip currencies **upsert** a `category_budgets` row when an amount is given or **delete** it when blank.

**Files:** Create `src/hooks/useUpsertCategory.js`, `src/hooks/useUpsertCategory.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/hooks/useUpsertCategory.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { from, insert, update, upsert, del, updateEq, delEq2 } = vi.hoisted(() => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: updateEq }))
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const delEq2 = vi.fn().mockResolvedValue({ error: null })
  const delEq1 = vi.fn(() => ({ eq: delEq2 }))
  const del = vi.fn(() => ({ eq: delEq1 }))
  const from = vi.fn(() => ({ insert, update, upsert, delete: del }))
  return { from, insert, update, upsert, del, updateEq, delEq2 }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpsertCategory } from './useUpsertCategory'
function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useUpsertCategory', () => {
  it('inserts a new category, upserts a given budget, deletes a blank one', async () => {
    const { result } = renderHook(() => useUpsertCategory('t1'), { wrapper })
    result.current.mutate({ name: 'Meal', budgets: { JPY: 40000, MYR: '' }, createdBy: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('budget_categories')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', name: 'Meal', created_by: 'm1' }))
    expect(from).toHaveBeenCalledWith('category_budgets')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'c1', currency: 'JPY', amount: 40000 }),
      expect.objectContaining({ onConflict: 'category_id,currency' }),
    )
    expect(del).toHaveBeenCalled() // MYR blank → delete that budget row
  })
  it('updates an existing category by id (no insert)', async () => {
    const { result } = renderHook(() => useUpsertCategory('t1'), { wrapper })
    result.current.mutate({ id: 'c1', name: 'Meals', budgets: {} })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meals' }))
    expect(updateEq).toHaveBeenCalledWith('id', 'c1')
    expect(insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/useUpsertCategory.test.jsx` → FAIL.

- [ ] **Step 3: Write minimal implementation** — `src/hooks/useUpsertCategory.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertCategory(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, budgets, createdBy }) => {
      let categoryId = id
      if (id) {
        const { error } = await supabase.from('budget_categories').update({ name }).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('budget_categories')
          .insert({ trip_id: tripId, name, created_by: createdBy ?? null })
          .select()
          .single()
        if (error) throw error
        categoryId = data.id
      }
      for (const [currency, amount] of Object.entries(budgets ?? {})) {
        if (amount === '' || amount == null) {
          const { error } = await supabase.from('category_budgets').delete().eq('category_id', categoryId).eq('currency', currency)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('category_budgets')
            .upsert({ category_id: categoryId, currency, amount: Number(amount) }, { onConflict: 'category_id,currency' })
          if (error) throw error
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/hooks/useUpsertCategory.test.jsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useUpsertCategory.js src/hooks/useUpsertCategory.test.jsx
git commit -m "feat: useUpsertCategory (category + per-currency budgets) (finance 5b)"
```

---

## Task 3: `useDeleteCategory`

**Files:** Create `src/hooks/useDeleteCategory.js`, `src/hooks/useDeleteCategory.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/hooks/useDeleteCategory.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn(); const del = vi.fn(() => ({ eq })); const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
import { useDeleteCategory } from './useDeleteCategory'
function wrapper({ children }) { const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return <QueryClientProvider client={c}>{children}</QueryClientProvider> }
beforeEach(() => vi.clearAllMocks())
describe('useDeleteCategory', () => {
  it('deletes by id from budget_categories', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeleteCategory('t1'), { wrapper })
    result.current.mutate('c1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('budget_categories'); expect(eq).toHaveBeenCalledWith('id', 'c1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/useDeleteCategory.test.jsx` → FAIL.

- [ ] **Step 3: Write minimal implementation** — `src/hooks/useDeleteCategory.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useDeleteCategory(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('budget_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/hooks/useDeleteCategory.test.jsx` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useDeleteCategory.js src/hooks/useDeleteCategory.test.jsx
git commit -m "feat: useDeleteCategory (finance 5b)"
```

---

## Task 4: `useSeedStarterCategories`

**Files:** Create `src/hooks/useSeedStarterCategories.js`, `src/hooks/useSeedStarterCategories.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/hooks/useSeedStarterCategories.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const { insert, from } = vi.hoisted(() => { const insert = vi.fn(); const from = vi.fn(() => ({ insert })); return { insert, from } })
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
import { useSeedStarterCategories } from './useSeedStarterCategories'
function wrapper({ children }) { const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return <QueryClientProvider client={c}>{children}</QueryClientProvider> }
beforeEach(() => vi.clearAllMocks())
describe('useSeedStarterCategories', () => {
  it('inserts the missing starter categories only', async () => {
    insert.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useSeedStarterCategories('t1'), { wrapper })
    result.current.mutate({ createdBy: 'm1', existingNames: ['Meal'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('budget_categories')
    const rows = insert.mock.calls[0][0]
    expect(rows.map((r) => r.name)).toEqual(['Hostel', 'Transport', 'Ticket', 'Photograph'])
    expect(rows.every((r) => r.trip_id === 't1' && r.created_by === 'm1')).toBe(true)
  })
  it('does nothing when all starters already exist', async () => {
    const { result } = renderHook(() => useSeedStarterCategories('t1'), { wrapper })
    result.current.mutate({ createdBy: 'm1', existingNames: ['Hostel', 'Meal', 'Transport', 'Ticket', 'Photograph'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/useSeedStarterCategories.test.jsx` → FAIL.

- [ ] **Step 3: Write minimal implementation** — `src/hooks/useSeedStarterCategories.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { STARTER_CATEGORIES } from '../lib/budget'

export function useSeedStarterCategories(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ createdBy, existingNames = [] } = {}) => {
      const rows = STARTER_CATEGORIES
        .filter((name) => !existingNames.includes(name))
        .map((name) => ({ trip_id: tripId, name, created_by: createdBy ?? null }))
      if (!rows.length) return
      const { error } = await supabase.from('budget_categories').insert(rows)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/hooks/useSeedStarterCategories.test.jsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useSeedStarterCategories.js src/hooks/useSeedStarterCategories.test.jsx
git commit -m "feat: useSeedStarterCategories (finance 5b)"
```

---

## Task 5: `BudgetCategory` — one category card

**Files:** Create `src/components/BudgetCategory.jsx`, `.module.css`, `.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/components/BudgetCategory.test.jsx`:
```js
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetCategory } from './BudgetCategory'

const category = { id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }
const team = [
  { category_id: 'c1', currency: 'JPY', total_amount: 31000 },
  { category_id: 'c1', currency: 'MYR', total_amount: 50 }, // spend, no budget
]

describe('BudgetCategory', () => {
  it('shows a sub-bar per currency: budgeted (spent/budget) and spend-only ("no budget set")', () => {
    render(<BudgetCategory category={category} teamExpenses={team} canManage={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText('¥31,000 / ¥40,000')).toBeInTheDocument()
    expect(screen.getByText(/no budget set/i)).toBeInTheDocument() // MYR
  })
  it('flags over budget', () => {
    const over = [{ category_id: 'c1', currency: 'JPY', total_amount: 45000 }]
    render(<BudgetCategory category={category} teamExpenses={over} canManage={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/over budget/i)).toBeInTheDocument()
  })
  it('shows a "set a budget" prompt when there is no budget and no spend', () => {
    render(<BudgetCategory category={{ id: 'c9', name: 'Photograph', category_budgets: [] }} teamExpenses={team} canManage onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/set a budget/i)).toBeInTheDocument()
  })
  it('shows edit/remove only when canManage', async () => {
    const onEdit = vi.fn(), onRemove = vi.fn()
    const { rerender } = render(<BudgetCategory category={category} teamExpenses={team} canManage={false} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit meal/i })).not.toBeInTheDocument()
    rerender(<BudgetCategory category={category} teamExpenses={team} canManage onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit meal/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove meal/i }))
    expect(onEdit).toHaveBeenCalledWith(category); expect(onRemove).toHaveBeenCalledWith(category)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/BudgetCategory.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/BudgetCategory.jsx`:
```js
import { formatMoney } from '../lib/currencies'
import { categoryRows } from '../lib/budget'
import styles from './BudgetCategory.module.css'

export function BudgetCategory({ category, teamExpenses, canManage, onEdit, onRemove }) {
  const rows = categoryRows(category, teamExpenses)
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.name}>{category.name}</span>
        {canManage && (
          <span className={styles.act}>
            <button type="button" aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}>✎</button>
            <button type="button" aria-label={`Remove ${category.name}`} onClick={() => onRemove(category)}>✕</button>
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className={styles.prompt}>Set a budget to start tracking this category.</p>
      ) : rows.map((r) => {
        const over = r.budget != null && r.spent > r.budget
        const pct = r.budget ? Math.min(100, (r.spent / r.budget) * 100) : 0
        return (
          <div key={r.currency} className={styles.row}>
            <div className={styles.line}>
              <span className={styles.cur}>{r.currency}</span>
              <span className={styles.n}>
                {r.budget == null
                  ? `${formatMoney(r.spent, r.currency)} · no budget set`
                  : `${formatMoney(r.spent, r.currency)} / ${formatMoney(r.budget, r.currency)}`}
              </span>
            </div>
            <div className={styles.bar}><span className={over ? styles.over : ''} style={{ width: `${r.budget ? pct : 0}%` }} /></div>
            {r.budget != null && (
              <div className={`${styles.rem} ${over ? styles.overText : ''}`}>
                {over ? `${formatMoney(r.spent - r.budget, r.currency)} over budget` : `${formatMoney(r.budget - r.spent, r.currency)} left`}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

`src/components/BudgetCategory.module.css`:
```css
.card { padding: 14px 20px; border-top: 1px solid #f1f6fb; }
.card:first-child { border-top: 0; }
.head { display: flex; align-items: center; gap: 8px; }
.name { font-size: 14px; font-weight: 600; }
.act { margin-left: auto; display: inline-flex; gap: 2px; }
.act button { border: 0; background: transparent; color: var(--ink-muted); cursor: pointer; font-size: 13px; padding: 4px; border-radius: 6px; }
.act button:hover { background: var(--c-mist); color: var(--ink); }
.prompt { font-size: 12px; color: var(--ink-muted); margin: 8px 0 0; }
.row { margin-top: 10px; }
.line { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.cur { font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--ink-muted); background: var(--c-mist); padding: 1px 6px; border-radius: 5px; }
.n { margin-left: auto; font-family: var(--font-mono); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.bar { height: 8px; border-radius: 999px; background: var(--c-sky-100); overflow: hidden; margin-top: 6px; }
.bar > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--primary), var(--primary-strong)); }
.bar > span.over { background: linear-gradient(90deg, #ef4444, #b91c1c); }
.rem { font-size: 10.5px; color: var(--ink-muted); margin-top: 5px; }
.rem.overText { color: var(--c-danger); font-weight: 600; }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/BudgetCategory.test.jsx` → PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/BudgetCategory.jsx src/components/BudgetCategory.module.css src/components/BudgetCategory.test.jsx
git commit -m "feat: BudgetCategory card with per-currency sub-bars (finance 5b)"
```

---

## Task 6: `BudgetTotals` — per-currency roll-up

**Files:** Create `src/components/BudgetTotals.jsx`, `.module.css`, `.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/components/BudgetTotals.test.jsx`:
```js
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetTotals } from './BudgetTotals'

describe('BudgetTotals', () => {
  it('shows budgeted, spent and under/over per currency', () => {
    const totals = { JPY: { budgeted: 40000, spent: 36000, delta: 4000 }, MYR: { budgeted: 0, spent: 50, delta: -50 } }
    render(<BudgetTotals totals={totals} />)
    expect(screen.getByText('In JPY')).toBeInTheDocument()
    expect(screen.getByText('¥36,000')).toBeInTheDocument()      // spent
    expect(screen.getByText('¥40,000')).toBeInTheDocument()      // budgeted
    expect(screen.getByText(/¥4,000 under/i)).toBeInTheDocument()
    expect(screen.getByText(/RM50 over/i)).toBeInTheDocument()
  })
  it('renders nothing when there are no totals', () => {
    const { container } = render(<BudgetTotals totals={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/BudgetTotals.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/BudgetTotals.jsx`:
```js
import { formatMoney } from '../lib/currencies'
import styles from './BudgetTotals.module.css'

export function BudgetTotals({ totals }) {
  const codes = Object.keys(totals ?? {})
  if (codes.length === 0) return null
  return (
    <section className={styles.panel}>
      <div className={styles.head}><h3 className={styles.h}>Budget total</h3><p className={styles.s}>Team spend vs plan</p></div>
      {codes.sort().map((c) => {
        const t = totals[c]
        const over = t.delta < 0
        return (
          <div key={c} className={styles.cur}>
            <div className={styles.curlbl}>In {c}</div>
            <div className={styles.line}><span>Spent</span><span className={styles.n}>{formatMoney(t.spent, c)}</span></div>
            <div className={styles.line}><span>Budget</span><span className={styles.n}>{formatMoney(t.budgeted, c)}</span></div>
            <div className={`${styles.line} ${over ? styles.over : styles.under}`}>
              <span>{over ? 'Over by' : 'Under by'}</span>
              <span className={styles.n}>{formatMoney(Math.abs(t.delta), c)} {over ? 'over' : 'under'}</span>
            </div>
          </div>
        )
      })}
    </section>
  )
}
```

`src/components/BudgetTotals.module.css`:
```css
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
.head { padding: 16px 18px 8px; }
.h { font-family: var(--font-display); font-weight: 700; font-size: 15px; margin: 0; }
.s { font-size: 11.5px; color: var(--ink-muted); margin: 2px 0 0; }
.cur { padding: 6px 18px 14px; }
.curlbl { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); font-weight: 700; padding: 10px 0 6px; border-bottom: 1px solid var(--c-line); }
.line { display: flex; align-items: center; padding: 7px 0; font-size: 13px; }
.n { margin-left: auto; font-family: var(--font-mono); font-weight: 700; font-variant-numeric: tabular-nums; }
.under { color: #15803d; }
.over { color: var(--c-danger); }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/BudgetTotals.test.jsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/BudgetTotals.jsx src/components/BudgetTotals.module.css src/components/BudgetTotals.test.jsx
git commit -m "feat: BudgetTotals per-currency roll-up (finance 5b)"
```

---

## Task 7: `CategoryEditorModal` — name + two budget fields

**Files:** Create `src/components/CategoryEditorModal.jsx`, `.module.css`, `.test.jsx`.

Props: `tripId`, `trip` (for the two currencies), `memberId`, `category` (edit) or null, `onClose`.

- [ ] **Step 1: Write the failing test** — `src/components/CategoryEditorModal.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutate = vi.fn()
vi.mock('../hooks/useUpsertCategory', () => ({ useUpsertCategory: () => ({ mutate, isPending: false }) }))
import { CategoryEditorModal } from './CategoryEditorModal'

const trip = { id: 't1', departure_currency: 'MYR', destination_currency: 'JPY' }
beforeEach(() => vi.clearAllMocks())

describe('CategoryEditorModal', () => {
  it('blocks save without a name', async () => {
    render(<CategoryEditorModal tripId="t1" trip={trip} memberId="m1" category={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /save category/i }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
  })
  it('saves name + the two currency budgets (blank = empty)', async () => {
    render(<CategoryEditorModal tripId="t1" trip={trip} memberId="m1" category={null} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/category name/i), 'Meal')
    await userEvent.type(screen.getByLabelText(/destination budget/i), '40000')
    await userEvent.click(screen.getByRole('button', { name: /save category/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Meal', budgets: { MYR: '', JPY: '40000' }, createdBy: 'm1' }),
      expect.any(Object),
    )
  })
  it('prefills on edit and keeps the id', async () => {
    const category = { id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }
    render(<CategoryEditorModal tripId="t1" trip={trip} memberId="m1" category={category} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/category name/i)).toHaveValue('Meal')
    expect(screen.getByLabelText(/destination budget/i)).toHaveValue(40000)
    await userEvent.click(screen.getByRole('button', { name: /save category/i }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', name: 'Meal' }), expect.any(Object))
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/CategoryEditorModal.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/CategoryEditorModal.jsx`:
```js
import { useState } from 'react'
import { Modal } from './Modal'
import { currencyMeta } from '../lib/currencies'
import { useUpsertCategory } from '../hooks/useUpsertCategory'
import styles from './CategoryEditorModal.module.css'

export function CategoryEditorModal({ tripId, trip, memberId, category, onClose }) {
  const dep = trip.departure_currency ?? 'MYR'
  const dest = trip.destination_currency ?? 'JPY'
  const isEdit = !!category?.id
  const budgetFor = (cur) => {
    const row = (category?.category_budgets ?? []).find((b) => b.currency === cur)
    return row ? String(row.amount) : ''
  }
  const [name, setName] = useState(category?.name ?? '')
  const [depAmt, setDepAmt] = useState(budgetFor(dep))
  const [destAmt, setDestAmt] = useState(budgetFor(dest))
  const [error, setError] = useState('')
  const upsert = useUpsertCategory(tripId)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('A category name is required.'); return }
    setError('')
    upsert.mutate(
      { ...(isEdit ? { id: category.id } : {}), name: name.trim(), budgets: { [dep]: depAmt, [dest]: destAmt }, createdBy: memberId },
      { onSuccess: onClose, onError: () => setError('Could not save. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit category' : 'New category'}>
      <form className={styles.pad} noValidate onSubmit={handleSubmit}>
        <p className={styles.ey}>{isEdit ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</p>

        <label className={styles.label} htmlFor="bc-name">Category name</label>
        <input id="bc-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />

        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="bc-dep">Departure budget · {dep} ({currencyMeta(dep).symbol}) · optional</label>
            <input id="bc-dep" type="number" min="0" step="0.01" className={styles.input} value={depAmt} onChange={(e) => setDepAmt(e.target.value)} />
          </div>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="bc-dest">Destination budget · {dest} ({currencyMeta(dest).symbol}) · optional</label>
            <input id="bc-dest" type="number" min="0" step="0.01" className={styles.input} value={destAmt} onChange={(e) => setDestAmt(e.target.value)} />
          </div>
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submit} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save category'}</button>
        </div>
      </form>
    </Modal>
  )
}
```

`src/components/CategoryEditorModal.module.css`:
```css
.pad { padding: var(--space-5); display: flex; flex-direction: column; }
.ey { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); margin: 0 0 var(--space-3); }
.label { font-size: 12px; font-weight: 600; color: var(--ink-muted); margin: var(--space-3) 0 var(--space-1); }
.input { font: inherit; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: #fff; color: var(--ink); }
.input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.row { display: flex; gap: var(--space-3); }
.col { flex: 1; display: flex; flex-direction: column; }
.error { color: var(--c-danger); font-size: 13px; margin: var(--space-3) 0 0; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
.cancel, .submit { font: inherit; font-weight: 600; padding: 10px 18px; border-radius: var(--radius-sm); cursor: pointer; border: 1.5px solid var(--border); }
.cancel { background: #fff; color: var(--ink); }
.submit { background: var(--accent); border-color: var(--accent); color: #fff; }
.submit:disabled { opacity: .5; cursor: not-allowed; background: var(--c-slate); border-color: var(--c-slate); }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/CategoryEditorModal.test.jsx` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/CategoryEditorModal.jsx src/components/CategoryEditorModal.module.css src/components/CategoryEditorModal.test.jsx
git commit -m "feat: CategoryEditorModal (name + two budgets) (finance 5b)"
```

---

## Task 8: `BudgetView` — list + uncategorized + totals + empty state

**Files:** Create `src/components/BudgetView.jsx`, `.module.css`, `.test.jsx`.

Props: `trip`, `canManage`, `onAdd`, `onEdit(cat)`, `onRemove(cat)`, `onSeed`.

- [ ] **Step 1: Write the failing test** — `src/components/BudgetView.test.jsx`:
```js
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetView } from './BudgetView'

const tripWithCats = {
  budget_categories: [{ id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }],
  expenses: [
    { scope: 'team', category_id: 'c1', currency: 'JPY', total_amount: 31000 },
    { scope: 'team', category_id: null, currency: 'JPY', total_amount: 5000 },  // uncategorized
    { scope: 'private', category_id: null, currency: 'JPY', total_amount: 999 }, // ignored
  ],
}
const emptyTrip = { budget_categories: [], expenses: [] }

describe('BudgetView', () => {
  it('lists categories, the uncategorized section and the totals panel', () => {
    render(<BudgetView trip={tripWithCats} canManage onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={vi.fn()} />)
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText(/uncategorized/i)).toBeInTheDocument()
    expect(screen.getByText('Budget total')).toBeInTheDocument()
  })
  it('shows the empty state with seed + new buttons for a manager', async () => {
    const onSeed = vi.fn(), onAdd = vi.fn()
    render(<BudgetView trip={emptyTrip} canManage onAdd={onAdd} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={onSeed} />)
    expect(screen.getByText(/no budget categories yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add starter categories/i }))
    await userEvent.click(screen.getByRole('button', { name: /new category/i }))
    expect(onSeed).toHaveBeenCalled(); expect(onAdd).toHaveBeenCalled()
  })
  it('hides manager buttons for a viewer', () => {
    render(<BudgetView trip={emptyTrip} canManage={false} onAdd={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onSeed={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /new category/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/BudgetView.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/BudgetView.jsx`:
```js
import { formatMoney } from '../lib/currencies'
import { uncategorizedRows, budgetTotals } from '../lib/budget'
import { BudgetCategory } from './BudgetCategory'
import { BudgetTotals } from './BudgetTotals'
import styles from './BudgetView.module.css'

export function BudgetView({ trip, canManage, onAdd, onEdit, onRemove, onSeed }) {
  const categories = trip.budget_categories ?? []
  const teamExpenses = (trip.expenses ?? []).filter((e) => e.scope === 'team')
  const uncategorized = uncategorizedRows(teamExpenses)
  const totals = budgetTotals(categories, teamExpenses)

  if (categories.length === 0) {
    return (
      <div className={styles.empty}>
        <h3 className={styles.emptyTitle}>No budget categories yet</h3>
        <p className={styles.emptyText}>Track team spending against a plan, per currency.</p>
        {canManage && (
          <div className={styles.emptyActions}>
            <button type="button" className={styles.primary} onClick={onSeed}>+ Add starter categories</button>
            <button type="button" className={styles.ghost} onClick={onAdd}>New category</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <div className={styles.chead}>
          <h2 className={styles.ctitle}>📊 Budget</h2>
          {canManage && <button type="button" className={styles.add} onClick={onAdd}>+ New category</button>}
        </div>
        {categories.map((c) => (
          <BudgetCategory key={c.id} category={c} teamExpenses={teamExpenses} canManage={canManage} onEdit={onEdit} onRemove={onRemove} />
        ))}
        {uncategorized.length > 0 && (
          <div className={styles.uncat}>
            <div className={styles.uncatHead}>Uncategorized</div>
            {uncategorized.map((r) => (
              <div key={r.currency} className={styles.uncatRow}><span>{r.currency}</span><span className={styles.n}>{formatMoney(r.spent, r.currency)}</span></div>
            ))}
          </div>
        )}
      </section>
      <BudgetTotals totals={totals} />
    </div>
  )
}
```

`src/components/BudgetView.module.css`:
```css
.grid { display: grid; grid-template-columns: 1fr 340px; gap: var(--space-5); align-items: start; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
.chead { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--c-line); }
.ctitle { font-family: var(--font-display); font-weight: 700; font-size: 16px; margin: 0; }
.add { margin-left: auto; font: inherit; font-size: 12px; font-weight: 600; color: var(--primary-strong); background: #fff; border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 6px 13px; cursor: pointer; }
.uncat { padding: 12px 20px; border-top: 1px solid var(--c-line); background: var(--c-mist); }
.uncatHead { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-muted); font-weight: 700; margin-bottom: 4px; }
.uncatRow { display: flex; padding: 5px 0; font-size: 12.5px; color: var(--ink-muted); }
.n { margin-left: auto; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.empty { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: var(--space-6); text-align: center; }
.emptyTitle { font-family: var(--font-display); font-size: 18px; margin: 0 0 var(--space-2); }
.emptyText { color: var(--ink-muted); font-size: 14px; margin: 0 0 var(--space-4); }
.emptyActions { display: flex; gap: var(--space-3); justify-content: center; }
.primary, .ghost { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: var(--radius-sm); cursor: pointer; }
.primary { background: var(--accent); border: 1.5px solid var(--accent); color: #fff; }
.ghost { background: #fff; border: 1.5px solid var(--border); color: var(--ink); }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/BudgetView.test.jsx` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/BudgetView.jsx src/components/BudgetView.module.css src/components/BudgetView.test.jsx
git commit -m "feat: BudgetView (categories + uncategorized + totals + empty state) (finance 5b)"
```

---

## Task 9: Wire the Budget view into `Finance.jsx` + full suite + lint

**Files:** Modify `src/pages/Finance.jsx`, `src/pages/Finance.test.jsx`.

- [ ] **Step 1: Add a Budget test** — in `src/pages/Finance.test.jsx`, add the hook mocks at the top with the others:
```js
vi.mock('../hooks/useUpsertCategory', () => ({ useUpsertCategory: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('../hooks/useDeleteCategory', () => ({ useDeleteCategory: () => ({ mutate: vi.fn() }) }))
vi.mock('../hooks/useSeedStarterCategories', () => ({ useSeedStarterCategories: () => ({ mutate: vi.fn() }) }))
```
and add a test inside `describe('Finance', ...)`:
```js
  it('renders the Budget view when the Budget tab is selected', async () => {
    ctx = { trip: { ...baseTrip, budget_categories: [{ id: 'c1', name: 'Meal', category_budgets: [{ currency: 'JPY', amount: 40000 }] }] } }
    render(<Finance />)
    await userEvent.click(screen.getByRole('tab', { name: /budget/i }))
    expect(screen.getByText('Meal')).toBeInTheDocument()
    expect(screen.getByText('Budget total')).toBeInTheDocument()
  })
```
(Add `import userEvent from '@testing-library/user-event'` at the top if it isn't already imported — it was removed in 5a's lint pass, so re-add it.)

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/pages/Finance.test.jsx` → FAIL (Budget still shows the stub).

- [ ] **Step 3: Wire `BudgetView` into the page** — in `src/pages/Finance.jsx`:
  - Add imports:
```js
import { BudgetView } from '../components/BudgetView'
import { CategoryEditorModal } from '../components/CategoryEditorModal'
import { useDeleteCategory } from '../hooks/useDeleteCategory'
import { useSeedStarterCategories } from '../hooks/useSeedStarterCategories'
import { STARTER_CATEGORIES } from '../lib/budget'
```
  - Add state + hooks inside the component (near the existing `settle`/`del`):
```js
  const [catEditor, setCatEditor] = useState(null)
  const delCat = useDeleteCategory(trip.id)
  const seedCats = useSeedStarterCategories(trip.id)
```
  - Add handlers (near `onRemove`):
```js
  function onRemoveCategory(cat) { if (window.confirm('Delete this category? Its expenses become uncategorized.')) delCat.mutate(cat.id) }
  function onSeedCategories() {
    const existing = (trip.budget_categories ?? []).map((c) => c.name)
    seedCats.mutate({ createdBy: me?.id ?? null, existingNames: existing.filter((n) => STARTER_CATEGORIES.includes(n)) })
  }
```
  - Replace the budget stub line:
```js
      {view === 'budget' && <p className={styles.soon}>📊 Budget arrives in slice 5b.</p>}
```
with:
```js
      {view === 'budget' && (
        <BudgetView trip={trip} canManage={isWriter}
          onAdd={() => setCatEditor({ category: null })}
          onEdit={(cat) => setCatEditor({ category: cat })}
          onRemove={onRemoveCategory} onSeed={onSeedCategories} />
      )}
```
  - Add the category modal next to the existing expense modal (before `</section>`):
```js
      {catEditor && (
        <CategoryEditorModal tripId={trip.id} trip={trip} memberId={me?.id ?? null} category={catEditor.category} onClose={() => setCatEditor(null)} />
      )}
```

- [ ] **Step 4: Run the Finance test** — `npx vitest run src/pages/Finance.test.jsx` → PASS (all Finance tests incl. the new Budget one).

- [ ] **Step 5: Full suite + lint** — Run `npx vitest run` → all pass (re-run once if the whole suite cold-flakes to "no tests"). Then `npm run lint` → clean; fix any unused import/var introduced.

- [ ] **Step 6: Commit**
```bash
git add src/pages/Finance.jsx src/pages/Finance.test.jsx
git commit -m "feat: wire Budget view into Finance page (finance 5b)"
```

---

## Task 10: Manual verification & wrap-up

- [ ] **Step 1: Smoke-test** — `npm run dev`, open a trip → Finance → **Budget**. On a trip with no categories: see the empty state → "Add starter categories" inserts the 5 → "New category" / ✎ set a Departure/Destination budget → bars show team spend vs budget (over-budget goes red) → add a team expense in a category and watch its bar move → an uncategorized team expense appears in the Uncategorized section → the totals panel sums correctly. Delete a category → its expenses fall to Uncategorized (not deleted).
- [ ] **Step 2: Permissions** — as a viewer (second account), Budget is read-only (no New/Add starter/✎/✕), bars + totals still visible.
- [ ] **Step 3: RLS spot-check** — a viewer cannot insert/update/delete `budget_categories` or `category_budgets` (these policies were created in 5a; confirm once on live accounts).
- [ ] **Step 4: Final full test + lint** — `npx vitest run && npm run lint` → all green.
- [ ] **Step 5: Update the roadmap memory** — mark #5 slice 5b done (Budget: model-B per-currency bars, categories + seed, totals); 5c/5d pending. Follow the memory-writing rules.

---

## Self-review notes (author)

- **Spec coverage:** `lib/budget` categoryRows/uncategorizedRows/budgetTotals → Task 1; category CRUD hooks + seed → Tasks 2–4; per-currency sub-bars + over-budget + "no budget set" + "set a budget" prompt → Task 5; totals panel → Task 6; category editor (name + two budgets, create/edit prefill) → Task 7; list + uncategorized + totals + empty-state seed/new gating + viewer read-only → Task 8; page wiring + delete-confirm + seed existing-name filter → Task 9; manual/RLS → Task 10. No DB task (tables/RLS/embed exist from 5a); no route task (Finance already mounted).
- **Type consistency:** `useUpsertCategory` input `{id?, name, budgets:{[currency]:amount|''}, createdBy}` matches `CategoryEditorModal`'s mutate payload. `categoryRows(category, teamExpenses)` consumed by `BudgetCategory`; `budgetTotals(categories, teamExpenses)` → `BudgetTotals totals` prop shape `{[cur]:{budgeted,spent,delta}}`. `useSeedStarterCategories.mutate({createdBy, existingNames})` matches the page's `onSeedCategories`. `STARTER_CATEGORIES` exported from `lib/budget` and reused by the hook + page.
- **No placeholders:** every code/test step has full code + exact commands.
```
