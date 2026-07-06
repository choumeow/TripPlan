# TripPlan — Subsystem #5 (Slice 5b): Finance — Budget — Design

**Date:** 2026-07-06
**Status:** Approved (design)
**Builds on:** Finance 5a (core expenses/splits/balances/settle — merged to main) and the parent Finance
design `docs/superpowers/specs/2026-07-06-finance-design.md`
**Stack:** React 19 + Vite, Supabase, `@tanstack/react-query`, CSS Modules, Vitest + RTL

---

## 1. Context & scope

The Finance tab's **📊 Budget** sub-nav view is currently a stub ("arrives in 5b"). This slice makes
it real: host/editors define **budget categories**, each holding a **per-currency budget**, and the
view shows **team spend vs budget** as per-currency bars — **model B** (one category, per-currency
sub-bars), the option approved during Finance brainstorming.

**Already in place from 5a (no new DB work):**
- Tables `budget_categories(id, trip_id, name, sort_order, …)` and
  `category_budgets(id, category_id, currency, amount, unique(category_id, currency))` + their RLS
  (SELECT any member; INSERT/UPDATE/DELETE host/editor).
- `expenses.category_id → budget_categories(id) on delete set null` (deleting a category leaves its
  team expenses **uncategorized**, never deletes them).
- `useTrip` already embeds `budget_categories(*, category_budgets(*))` and `expenses(*, …)`.

So **5b is UI + hooks + pure logic only** — no new tables, no new RPC.

**In scope:** the pure budget computation (`lib/budget.js`); category CRUD + starter-seed hooks; the
Budget view (category cards with per-currency sub-bars, an uncategorized read-only section, a
per-currency totals panel, empty state); the category editor modal.

**Out of scope → later:** budget rollover/alerts, per-person budgets, budget history. Individual view
(5c), Receipts (5d).

---

## 2. Budget model (recap of the approved model B)

- A **category** is currency-agnostic (just a name). Its **budgets** live in `category_budgets`, one
  row per currency (approved: the trip's **Departure** and/or **Destination** currency; each optional).
- **Only team expenses** count toward budgets (private never does — per the parent spec).
- A category's **spend in a currency** = Σ `total_amount` of team expenses with that `category_id`
  and `currency`. A category shows a **sub-bar per currency** it has a budget in **or** has spend in.
  A currency with spend but **no budget** shows **"no budget set."**
- **"Other"-currency** team spend tagged to a category simply appears as an unbudgeted sub-bar.
- Deleting a category → its `category_budgets` cascade; its expenses become **uncategorized**.

---

## 3. Pure logic — `src/lib/budget.js` (unit-tested)

```
categoryRows(category, teamExpenses) -> [{ currency, spent, budget|null }]
  currencies = keys(category.category_budgets by currency) ∪ currencies of teamExpenses
               with category_id === category.id
  for each: spent = Σ team total_amount (category_id === id, that currency);
            budget = category_budgets amount for that currency, else null
  ordered: budgeted currencies first (stable), then spend-only

uncategorizedRows(teamExpenses) -> [{ currency, spent }]
  team expenses with category_id == null, grouped by currency (spend only)

budgetTotals(categories, teamExpenses) -> { [currency]: { budgeted, spent, delta } }
  budgeted = Σ all category_budgets amounts in that currency
  spent    = Σ ALL team expenses in that currency (incl. uncategorized — nothing hides)
  delta    = budgeted - spent  (>0 under, <0 over)
```

Pure, DB-free, testable. Reuses `groupByCurrency` from `lib/expenses` where useful.

---

## 4. Hooks (all invalidate `['trip', tripId]`)

- **`useUpsertCategory(tripId)`** — input `{ id?, name, budgets: { [currency]: amount|'' } }`.
  1. Insert (no `id`) or update (with `id`) the `budget_categories` row (`name`, `created_by` on insert).
  2. For each of the **trip's two currencies**: if an amount is given → **upsert** a `category_budgets`
     row (`onConflict: 'category_id,currency'`); if blank → **delete** that row.
  Client-sequenced (no RPC): writes are host/editor-gated by existing RLS and there's no hard
  cross-row invariant (unlike the split=total guard), so atomicity isn't required. A failure surfaces
  as an inline modal error.
- **`useDeleteCategory(tripId)`** — delete a `budget_categories` row by id (budgets cascade; expenses
  `set null`).
- **`useSeedStarterCategories(tripId)`** — the "Add starter categories" action: inserts Hostel / Meal /
  Transport / Ticket / Photograph as plain categories (**no** `category_budgets` rows — seeding a 0
  budget would read as instantly over-budget). The host then sets each amount via edit (defaulting to
  the destination currency field). Skips names that already exist so it's safe to re-run.

---

## 5. UI — the Budget view (replaces the `Finance.jsx` budget stub)

- **`BudgetView`** — reads `trip` (categories + team expenses) from props; renders the category list,
  the uncategorized section, the totals panel, and the empty state. Owns nothing but layout; the
  Finance page owns the category-editor modal + write handlers.
- **`BudgetCategory`** — one card: name + a **per-currency sub-bar** each (`spent / budget`, bar width
  `min(100, spent/budget)`, **over-budget → red**, remaining/over via `formatMoney`; "no budget set"
  when `budget == null`). Host/editor: ✎ / ✕ (delete confirms).
- **Uncategorized** — a trailing read-only block: per-currency uncategorized team spend, shown only
  when any exists. No edit affordances.
- **`BudgetTotals`** — per-currency roll-up: **budgeted / spent / under-over** (green under, red over).
- **Empty state** (no categories) — "No budget categories yet" + **"Add starter categories"** (seeds
  the 5) + **"New category"** (both host/editor only).
- **`CategoryEditorModal`** — name + **Departure budget** + **Destination budget** (both optional,
  labelled with the currency codes/symbols, prefilled on edit); routes to `useUpsertCategory`. Inline
  error on failure; submit disabled while pending. Name required.

### Permissions (RLS is the boundary — already enforced from 5a)
Host/editor: add/edit/delete categories + budgets, seed starters. Everyone: view bars + totals.

---

## 6. Data flow

Read: `BudgetView` uses `trip.budget_categories` (+ their `category_budgets`) and
`trip.expenses` filtered to `scope==='team'` (both already embedded by `useTrip`). No new fetch.
Writes: the three hooks above. Money always via `formatMoney(amount, currency)` (`lib/currencies`).

---

## 7. Error handling & edge cases

- **No categories** → empty state with the two buttons (host/editor) / a plain "No budget yet" (viewer).
- **Category with spend but no budget in a currency** → sub-bar shows spend + "no budget set."
- **Over budget** → red bar (capped width) + "X over budget."
- **Delete a category that has expenses** → allowed; expenses become uncategorized (surfaced in the
  uncategorized section) — never deleted.
- **Blank both budget fields** (incl. freshly-seeded starters) → a valid category with no budgets; the
  card shows a subtle "Set a budget" prompt and bars appear only once it has a budget or spend.
- **Save fails** → inline modal error; modal stays open, input preserved.
- **Legacy trip with no currencies** → the Finance page's currency gate (5a) already blocks the whole
  tab before Budget is reachable.

---

## 8. Component / file structure

```
src/lib/budget.js + .test.js                     pure: categoryRows / uncategorizedRows / budgetTotals
src/hooks/useUpsertCategory.js + .test.jsx       category + per-currency budgets (upsert/delete blanks)
src/hooks/useDeleteCategory.js + .test.jsx       delete category by id
src/hooks/useSeedStarterCategories.js + .test.jsx  insert the 5 example categories (destination cur)
src/components/BudgetCategory.jsx + .module.css + .test.jsx   one category card (per-currency sub-bars)
src/components/BudgetTotals.jsx + .module.css + .test.jsx     per-currency roll-up panel
src/components/CategoryEditorModal.jsx + .module.css + .test.jsx  name + 2 budget fields (create/edit)
src/components/BudgetView.jsx + .module.css + .test.jsx       list + uncategorized + totals + empty state
src/pages/Finance.jsx (modify)                   budget branch → <BudgetView/>; owns editor-modal state
```

Reuses: `formatMoney`/`currencyMeta` (`lib/currencies`), `groupByCurrency` (`lib/expenses`), `Modal`,
`callerMember`/`canWrite` (`lib/tripAccess`), design tokens. Each unit single-purpose: `budget.js`
holds all math; hooks do I/O; cards/panel/modal render; the page wires.

---

## 9. Testing

- **`lib/budget.js` (hard):** `categoryRows` (spend per currency; budgeted-and-spend-only currencies;
  "no budget" when budget absent), `uncategorizedRows`, `budgetTotals` (budgeted vs total spent incl.
  uncategorized; under/over sign).
- **Hooks:** `useUpsertCategory` (insert vs update; upserts a budget when amount given, deletes when
  blank), `useDeleteCategory`, `useSeedStarterCategories` (inserts the 5 example categories; skips
  existing names).
- **Components:** `BudgetCategory` (sub-bar per currency; over-budget red; "no budget set"; ✎/✕ gated),
  `BudgetTotals` (per-currency budgeted/spent/delta, under vs over), `CategoryEditorModal` (name
  required; prefill on edit; save maps budgets), `BudgetView` (empty state + starter/new buttons gated;
  uncategorized section only when spend exists; viewer read-only).
- **RLS:** already created + (to be) verified in 5a — a quick host-writes / viewer-blocked SQL check
  for `budget_categories` / `category_budgets`.

---

## 10. Out of scope (restated)

Budget rollover, alerts/notifications, per-person budgets, budget history/export. Individual view →
5c. Receipts + transport tickets → 5d.
