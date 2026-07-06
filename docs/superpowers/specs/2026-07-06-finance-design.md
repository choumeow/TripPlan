# TripPlan — Subsystem #5: Finance — Design

**Date:** 2026-07-06
**Status:** Approved (design)
**Builds on:** Foundation (#0), Projects & Dashboard (#1), Project Shell + Overview (#2a), Invitations & Notifications (#2b), Planning (#3a/#3b), Packing (#4) — see `docs/superpowers/specs/`
**Stack:** React 19 + Vite, Supabase (Postgres + RLS + RPC + Storage), `react-router-dom`, `@tanstack/react-query`, CSS Modules

---

## 1. Context & scope

`/trip/:tripId/finance` is currently a `ComingSoon` stub. This subsystem makes it a full
**group-trip money manager**, covering the complete Foundation vision (Budget + Team split +
Individual + receipts). It is organised as a **segmented sub-nav** under the one Finance tab:

- **🧾 Team** — shared expenses, split among travellers, with a per-currency **"who owes whom"**
  settle-up.
- **📊 Budget** — host-defined categories with **per-currency budget bars**; only team expenses
  count toward budget.
- **🧍 Individual** — a personal view = your **private** (unsplit, self-only) expenses **plus your
  share** of team expenses = "what this trip cost me."

### Two-currency model (no conversion)

Each trip has **two host-chosen currencies** — a **departure** currency (home) and a
**destination** currency — both selected at trip creation. Every expense carries an **explicit
currency**: the add form offers **Departure / Destination / Other** (Other reveals a full currency
dropdown), so an expense may be in any currency. **There is no exchange-rate conversion anywhere**:
balances, summaries, and budgets are computed **per distinct currency** (usually 2, more if "Other"
is used) as independent ledgers.

### Build phasing (one spec, phased plan)

Large subsystem → the implementation plan builds in slices, each independently working/testable:

- **5a — Core:** currency prerequisite + `expenses`/`expense_splits` + `record_expense` RPC +
  Team view (list, add/edit form with the balance guard) + balances + `settlements` + settle-up.
- **5b — Budget:** `budget_categories` + `category_budgets` (model B) + Budget view.
- **5c — Individual:** the Individual view (private expenses + team-share rollup).
- **5d — Receipts:** Supabase Storage bucket + reusable upload component → team-expense receipts
  **and** journey-transport tickets on the Overview.

**In scope:** everything in §2–§8. **Out of scope:** §10.

---

## 2. Currency prerequisite (touches trip creation)

Everything rests on the two per-trip currencies, so this lands first (in 5a).

- **`trips` table** — add two columns:
  ```sql
  alter table public.trips add column if not exists departure_currency  text;
  alter table public.trips add column if not exists destination_currency text;
  ```
  (Nullable so existing rows survive; the app prompts to set them — see below.)
- **Trip creation** — `CreateTripModal` gains two currency pickers (departure + destination); the
  `create_trip` RPC accepts and stores them. A trip-settings edit (in `EditTripModal`) can change
  them later.
- **`src/lib/currencies.js`** — single source of truth mapping ISO code → `{ symbol, name }` for a
  curated common-currency list (drives the "Other" dropdown and all money formatting). Departure /
  destination are the one-tap defaults derived from the trip.
- **Existing trips** (created before this subsystem, so both columns null) → the Finance page shows
  a one-time **"Set your trip currencies"** gate (host/editor) before any expense can be added.
  This reuses the trip-settings edit path.

Money is always formatted via a `formatMoney(amount, currencyCode)` helper in `currencies.js`
(symbol + locale-aware grouping) — never hardcoded.

---

## 3. Data model + RLS

Reuses the `SECURITY DEFINER` helpers `is_trip_member(trip_id)`, `trip_role(trip_id)`, and
`member_user_id(member_id)` (the last built for Packing #4 for per-user visibility). Raw-SQL
tables need explicit grants (the Foundation 403 lesson).

### `expenses` (team + private share one table via `scope`)

```
expenses
  id               uuid pk default gen_random_uuid()
  trip_id          uuid not null references trips(id) on delete cascade
  scope            text not null check (scope in ('team','private'))
  description      text not null
  currency         text not null                      -- ISO code (e.g. 'MYR','JPY')
  total_amount     numeric(12,2) not null check (total_amount >= 0)
  paid_by          uuid references trip_members(id) on delete set null   -- team only
  owner_member_id  uuid references trip_members(id) on delete cascade    -- private only
  category_id      uuid references budget_categories(id) on delete set null  -- team only, nullable
  spent_on         date
  receipt_url      text                               -- 5d, team only, optional
  created_by       uuid references trip_members(id) on delete set null
  created_at       timestamptz not null default now()
  check ( (scope='team'    and owner_member_id is null)
       or (scope='private' and paid_by is null and category_id is null) )
```

`create index on public.expenses (trip_id);`

**RLS**
```
select : is_trip_member(trip_id) AND (
           scope='team'
           OR member_user_id(owner_member_id) = auth.uid()   -- own private only
         )
insert/update/delete :
           (scope='team'    AND trip_role(trip_id) in ('host','editor'))
        OR (scope='private' AND member_user_id(owner_member_id) = auth.uid())
```
Team writes normally go through the `record_expense` RPC (below) so splits stay balanced; the
direct-table policy still gates private writes and backstops the RPC.

### `expense_splits` (team only; who owes what)

```
expense_splits
  id         uuid pk default gen_random_uuid()
  expense_id uuid not null references expenses(id) on delete cascade
  member_id  uuid not null references trip_members(id) on delete cascade
  amount     numeric(12,2) not null check (amount >= 0)
```
`create index on public.expense_splits (expense_id);`
**Invariant:** `SUM(amount) = expenses.total_amount` for each expense — enforced by the RPC.

**RLS** — `select` if you can see the parent expense (`exists` subquery on `expenses` with the same
predicate, or via `is_trip_member(trip via join)`); writes only via the RPC (no direct
insert/update grant needed beyond what the RPC's `SECURITY DEFINER` uses).

### `budget_categories` + `category_budgets` (model B: one category, per-currency budgets)

```
budget_categories
  id uuid pk, trip_id uuid not null references trips(id) on delete cascade,
  name text not null, sort_order int not null default 0,
  created_by uuid references trip_members(id) on delete set null, created_at timestamptz default now()

category_budgets
  id uuid pk, category_id uuid not null references budget_categories(id) on delete cascade,
  currency text not null, amount numeric(12,2) not null check (amount >= 0),
  unique (category_id, currency)
```
**RLS** — both: `select` any member; `insert/update/delete` host/editor.
**Seed:** on trip creation, seed a few example categories (Hostel / Meal / Transport / Ticket /
Photograph) each with one `category_budgets` row in the **destination** currency (host edits after).

### `settlements` (a recorded "X paid Y back")

```
settlements
  id uuid pk, trip_id uuid not null references trips(id) on delete cascade,
  from_member uuid not null references trip_members(id) on delete cascade,
  to_member   uuid not null references trip_members(id) on delete cascade,
  currency text not null, amount numeric(12,2) not null check (amount > 0),
  created_by uuid references trip_members(id) on delete set null, created_at timestamptz default now()
```
**RLS** — `select` any member; `insert` if `from_member` or `to_member` is the caller's own member
row **or** caller is host/editor (checked via `member_user_id(...) = auth.uid()` / `trip_role`).
Delete (undo a settlement) = same authz.

### Storage (5d) + transport tickets

- A Supabase **Storage bucket** `receipts`, path-scoped per trip (e.g. `receipts/<trip_id>/<uuid>`).
  Storage RLS: a member may read/write objects under a `<trip_id>` prefix where
  `is_trip_member(trip_id)`; team-expense receipt writes further limited to host/editor.
- **`transport`** table — add `ticket_url text` (journey-transport ticket/receipt, Overview). Reuses
  the same bucket + upload component. Existing transport RLS already gates writes to host/editor.

`grant select, insert, update, delete` to `authenticated` on every new table; `grant execute` on
the RPCs.

---

## 4. The atomic write: `record_expense` RPC

A team expense and its splits must be created **together** and **balance**. A `SECURITY DEFINER`
RPC does both in one transaction and rejects an unbalanced record — the server half of the
"can't save unbalanced" rule (the form enforces the client half):

```sql
create or replace function public.record_expense(
  p_expense_id uuid,          -- null = insert, non-null = update
  p_trip_id uuid, p_description text, p_currency text, p_total numeric,
  p_paid_by uuid, p_category_id uuid, p_spent_on date, p_receipt_url text,
  p_splits jsonb              -- [{member_id, amount}, ...]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sum numeric; v_id uuid;
begin
  if not public.trip_role(p_trip_id) in ('host','editor') then raise exception 'forbidden'; end if;
  select coalesce(sum((s->>'amount')::numeric),0) into v_sum from jsonb_array_elements(p_splits) s;
  if round(v_sum,2) <> round(p_total,2) then raise exception 'splits must equal total'; end if;
  -- insert (or update by p_expense_id) the scope='team' expenses row -> v_id;
  -- delete existing expense_splits for v_id, then insert one row per p_splits element;
  -- return v_id.
end $$;
```
(The plan spells out the full insert/update/replace body; this block fixes the shape and the
balance check, which are the design-level decisions.)

Editing a team expense routes through the same RPC (replaces the split set). **Private** expenses
are plain RLS inserts (no splits, no RPC). Client hook: `useUpsertExpense` (team → RPC; private →
table insert), plus `useDeleteExpense`.

---

## 5. Balance & split logic (pure, unit-tested)

- **`src/lib/expenses.js`** — pure: `equalSplit(total, memberIds)` (even split with remainder to
  the first payer(s)); `splitsBalance(total, splits)` → boolean (the guard); `groupByCurrency(items)`;
  `myShare(expense, splits, memberId)`.
- **`src/lib/balances.js`** — pure: for a currency, from team expenses (`paid_by`, `total`) + splits
  (`member owes`) + settlements, compute each member's **net**, then **greedy-simplify** to minimal
  pairwise debts `{ from, to, amount }`. Also `myDebts(balances, memberId)`. Fully testable without
  a DB. A debt's ✓ settle inserts a `settlement` of that amount (`useSettleDebt`).

---

## 6. UI

Finance page reads `trip` from outlet context, derives `callerMember` + `canWrite` (reuse
`lib/tripAccess`), owns the sub-nav selection + modal state. Segmented sub-nav:
**🧾 Team · 📊 Budget · 🧍 Individual** (a small segmented control, sticky under the tab row).

### Team view
- **Expense list** — all team expenses, mixed currencies (each row shows its own via `formatMoney`):
  category color, description, paid-by avatar, split summary ("split 4 ways"), 📎 when a receipt is
  attached, `spent_on`, and ✎/✕ (host/editor). `+ Add expense`.
- **BalancePanel** — per-currency sections; each pairwise debt `Payer → Receiver  amount` with a
  **✓ settle** button (enabled for the two involved or host/editor). All-settled → a "settled" note.

### Budget view (model B)
- **BudgetCategory** rows — each category shows a **per-currency sub-bar** (spent vs its
  `category_budgets` amount; over-budget bar goes red; a currency with spend but no budget shows
  "no budget set"). Host/editor: `+ New category`, ✎/✕, per-currency budget inputs.
- Only **team** expenses feed budget; private never does.

### Individual view (self)
- **Hero** — "your trip cost" per currency = your team-share + your private total.
- **Your share of team expenses** — each team expense with your split amount.
- **Your private expenses** — 🔒 self-only list, `+ Add private expense`, ✎/✕ (owner).
- **Your debts** — your outstanding liabilities from the settle-up, per currency (with ✓).

### ExpenseEditorModal (team) — reuses `Modal`
Currency field (**Departure / Destination / Other▾** → currency dropdown) → **Category** →
**total** → **paid by** → **date** → **participant picker** (checkbox + editable amount per member,
default equal via "↺ Split equally") → **balance guard**: a live "Balanced / Off by X" indicator
that **disables Save until `Σ(splits) = total`** → optional **receipt** (5d). Private variant: a slim
form (description, currency, amount, date) — no category/paid-by/split.

### ReceiptUpload (5d)
A reusable component (bucket `receipts`): pick/preview an image, upload on save, thumbnail + tap to
view. Used by `ExpenseEditorModal` (team) and `TransportEditorModal` (journey tickets, Overview).

### Permissions (UI mirrors RLS/RPC; server is the boundary)
- **Team expenses + budget categories** — host/editor add/edit/delete.
- **Private expenses** — the owner (any role), visible only to them.
- **✓ settle a debt** — the two members involved **or** host/editor.
- Viewers: read team + budget; own their private list; may settle debts they're party to.

---

## 7. Data flow (react-query)

- **Read** — extend `useTrip`'s embedded select with `expenses(*, expense_splits(*))`,
  `budget_categories(*, category_budgets(*))`, and `settlements(*)`. RLS auto-filters private
  expenses per user. One round-trip (same pattern as transport/plan_items/packing_items).
- **Mutations (invalidate `['trip', tripId]`):** `useUpsertExpense` (team→`record_expense` RPC;
  private→insert), `useDeleteExpense`, `useSettleDebt` (insert settlement; optimistic),
  `useUpsertCategory`/`useDeleteCategory`, `useUploadReceipt` (5d, Storage), and the extended
  `create_trip`/`useUpdateTrip` for the two currencies.

---

## 8. Component / file structure

```
src/lib/currencies.js            code → {symbol,name}; formatMoney; DEPARTURE/DESTINATION from trip
src/lib/expenses.js              pure: equalSplit, splitsBalance, groupByCurrency, myShare
src/lib/balances.js              pure: per-currency net + greedy pairwise simplify; myDebts
src/hooks/useUpsertExpense.js    team→record_expense RPC / private→insert
src/hooks/useDeleteExpense.js
src/hooks/useSettleDebt.js       insert settlement (optimistic)
src/hooks/useUpsertCategory.js / useDeleteCategory.js
src/hooks/useUploadReceipt.js    (5d) Supabase Storage upload → path
src/hooks/useTrip.js (modify)    embed expenses/splits/budget_categories/category_budgets/settlements
src/components/ExpenseEditorModal.jsx     currency→category→total→paid-by→split guard→receipt
src/components/ExpenseRow.jsx
src/components/BalancePanel.jsx            per-currency pairwise debts + ✓ settle
src/components/BudgetCategory.jsx + CategoryEditorModal.jsx
src/components/IndividualSummary.jsx
src/components/ReceiptUpload.jsx           (5d) reusable; used by expense + transport editors
src/components/CreateTripModal.jsx (modify) + EditTripModal.jsx (modify)  two currency pickers
src/components/TransportEditorModal.jsx (modify)  ticket upload (5d)
src/pages/Finance.jsx + css                segmented sub-nav + the three views
src/App.jsx (modify)                       /finance route → <Finance/> (replace ComingSoon)
```
Reuses: `Modal`, `callerMember`/`canWrite` (`lib/tripAccess`), `initials`/`memberName`
(`lib/display`), the RLS helpers, design tokens. Each unit single-purpose: pure libs hold all
math; hooks do I/O; components render; the page wires.

---

## 9. Error handling, validation & edge cases

- **No trip currencies set** (legacy trip) → gate the page with a "Set your trip currencies" prompt.
- **Unbalanced split** → Save disabled (client) + `record_expense` rejects (server); inline error.
- **Load fails** → inline error + retry; never a blank page.
- **Empty states** → "No expenses yet" / "No categories yet" / "You're all settled".
- **Member removed** → `paid_by`/split/settlement member FKs `set null`/`cascade` appropriately;
  balances recompute from surviving rows; a removed private-owner's expenses cascade-delete.
- **Currency with spend but no budget** (model B) → sub-bar shows spend + "no budget set".
- **Private visibility** → RLS strips other members' private rows; nothing to hide client-side.
- **Receipt upload fails** (5d) → the expense still saves; receipt marked "upload failed, retry".

---

## 10. Testing

- **Pure libs (hard):** `currencies.formatMoney`; `expenses.equalSplit` (remainder distribution),
  `splitsBalance`; `balances` net computation + **greedy pairwise simplification** (incl.
  settlements zeroing a debt, multi-currency independence).
- **Hooks:** `useUpsertExpense` (team→RPC params, private→insert), `useSettleDebt` (optimistic +
  rollback), category hooks, `useTrip` embed shape, `useUploadReceipt` (mocked Storage).
- **Components:** `ExpenseEditorModal` — currency field (Other reveals dropdown), balance guard
  disables Save until balanced, private variant hides category/paid-by/split; `BalancePanel` — per
  currency, settle authz; `BudgetCategory` — per-currency bars + over-budget; `IndividualSummary` —
  team-share + private, private visible only to self; currency pickers in create/settings.
- **RLS / RPC (SQL checks in the plan):** private expense hidden from other members, visible to
  owner; `record_expense` rejects `Σ(splits) ≠ total` and non-writers; settlement insert authz (party
  or host/editor); budget writes host/editor only; Storage object access scoped to trip members.

---

## 11. Out of scope

Currency **conversion** / exchange rates (per-currency ledgers only). Recurring/scheduled expenses.
Expense comments/threads. CSV/PDF export. Multiple photos per receipt (one per expense). Discussion
(#6). Anything not in §1–§8.
