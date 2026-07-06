# Finance 5a — Core Expenses, Splits, Balances & Settle-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first Finance slice — two per-trip currencies, team expenses with an editable balanced split, per-currency "who owes whom" with settle-up — as a working Team view under `/trip/:tripId/finance`.

**Architecture:** One `expenses` table (`scope` team|private) + `expense_splits` + `settlements`, with a `record_expense` SECURITY DEFINER RPC that inserts an expense and its splits atomically and rejects `Σ(splits) ≠ total`. Balance math is pure and unit-tested (`lib/balances.js`, `lib/expenses.js`); currencies are a config (`lib/currencies.js`). The Team view renders the mixed-currency list + a per-currency settle-up panel. This slice also lands the currency prerequisite (two `trips` columns + create/edit pickers). Budget (5b), Individual (5c), and Receipts (5d) are later slices; their schema (categories) is created here but their UI is not.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS + RPC), `@tanstack/react-query`, CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-finance-design.md` (§1, §2, §3, §4, §5, §6-Team, §7, §8).

---

## File structure (5a)

```
src/lib/currencies.js + .test.js         NEW  code→{symbol,name}, currencyMeta, formatMoney, CURRENCY_CODES
src/lib/expenses.js + .test.js           NEW  pure: equalSplit, splitsBalance, groupByCurrency, myShare
src/lib/balances.js + .test.js           NEW  pure: netByMember, simplify (greedy), pairwiseDebts, myDebts
src/hooks/useCreateTrip.js               MOD  pass p_departure_currency / p_destination_currency
src/hooks/useCreateTrip.test.jsx         MOD  assert new params
src/components/CreateTripModal.jsx + test MOD  two currency <select>s
src/hooks/useUpdateTrip.js               MOD  allow departure_currency/destination_currency update
src/components/EditTripModal.jsx + test  MOD  two currency <select>s (also the "set currencies" path)
src/hooks/useTrip.js + test              MOD  embed expenses/splits/settlements/budget_categories/category_budgets
src/hooks/useUpsertExpense.js + test     NEW  team→record_expense RPC; private→insert
src/hooks/useDeleteExpense.js + test     NEW  delete by id
src/hooks/useSettleDebt.js + test        NEW  insert a settlement
src/components/ExpenseRow.jsx + css + test        NEW  one expense row
src/components/ExpenseEditorModal.jsx + css + test NEW  team form: currency→category→total→paid-by→split guard
src/components/BalancePanel.jsx + css + test      NEW  per-currency pairwise debts + ✓ settle
src/pages/Finance.jsx + css + test       NEW  segmented sub-nav (Team built; Budget/Individual stubs) + currency gate
src/App.jsx + test                       MOD  /finance route → <Finance/>
```

Reuses: `Modal`, `callerMember`/`canWrite` (`lib/tripAccess`), `initials`/`memberName` (`lib/display`),
the `is_trip_member`/`trip_role`/`member_user_id` RLS helpers, design tokens.

**Harness note (applies to every task):** vitest v4 on this machine intermittently fails a fresh test
file's FIRST run with a spurious "reading 'config'" / "no tests" error. Re-run the same
`npx vitest run <file>` once or twice; only a real assertion diff counts. Run single files, not the
whole suite (except the final task).

---

## Task 1: Database schema — currencies, expenses, splits, categories, settlements, RPC (Supabase SQL)

Schema SQL is applied by hand in the Supabase SQL editor (repo has no migration files). No Vitest.

**Files:** Reference only: `docs/superpowers/specs/2026-07-06-finance-design.md` §2–§4.

- [ ] **Step 1: Apply the schema** — run this whole block in Supabase → SQL editor:

```sql
-- ── trips: two currencies ────────────────────────────────────────────────
alter table public.trips add column if not exists departure_currency  text;
alter table public.trips add column if not exists destination_currency text;

-- ── budget_categories + category_budgets (schema now; UI in 5b) ───────────
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null, sort_order int not null default 0,
  created_by uuid references public.trip_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  currency text not null, amount numeric(12,2) not null check (amount >= 0),
  unique (category_id, currency)
);
create index if not exists budget_categories_trip_idx on public.budget_categories (trip_id);

-- ── expenses (team + private) ────────────────────────────────────────────
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  scope text not null check (scope in ('team','private')),
  description text not null,
  currency text not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  paid_by uuid references public.trip_members(id) on delete set null,
  owner_member_id uuid references public.trip_members(id) on delete cascade,
  category_id uuid references public.budget_categories(id) on delete set null,
  spent_on date,
  receipt_url text,
  created_by uuid references public.trip_members(id) on delete set null,
  created_at timestamptz not null default now(),
  check ( (scope='team' and owner_member_id is null)
       or (scope='private' and paid_by is null and category_id is null) )
);
create index if not exists expenses_trip_idx on public.expenses (trip_id);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0)
);
create index if not exists expense_splits_expense_idx on public.expense_splits (expense_id);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_member uuid not null references public.trip_members(id) on delete cascade,
  to_member uuid not null references public.trip_members(id) on delete cascade,
  currency text not null, amount numeric(12,2) not null check (amount > 0),
  created_by uuid references public.trip_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists settlements_trip_idx on public.settlements (trip_id);

-- ── grants ───────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.budget_categories, public.category_budgets,
  public.expenses, public.expense_splits, public.settlements to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.budget_categories enable row level security;
alter table public.category_budgets  enable row level security;
alter table public.expenses          enable row level security;
alter table public.expense_splits    enable row level security;
alter table public.settlements       enable row level security;

create policy "bc_select" on public.budget_categories for select using (public.is_trip_member(trip_id));
create policy "bc_write"  on public.budget_categories for all
  using (public.trip_role(trip_id) in ('host','editor'))
  with check (public.trip_role(trip_id) in ('host','editor'));

create policy "cb_select" on public.category_budgets for select using (
  exists (select 1 from public.budget_categories c where c.id = category_id and public.is_trip_member(c.trip_id)));
create policy "cb_write" on public.category_budgets for all
  using (exists (select 1 from public.budget_categories c where c.id = category_id and public.trip_role(c.trip_id) in ('host','editor')))
  with check (exists (select 1 from public.budget_categories c where c.id = category_id and public.trip_role(c.trip_id) in ('host','editor')));

create policy "exp_select" on public.expenses for select using (
  public.is_trip_member(trip_id) and (
    scope = 'team' or public.member_user_id(owner_member_id) = auth.uid()));
create policy "exp_write" on public.expenses for all
  using (
    (scope='team'    and public.trip_role(trip_id) in ('host','editor'))
 or (scope='private' and public.member_user_id(owner_member_id) = auth.uid()))
  with check (
    (scope='team'    and public.trip_role(trip_id) in ('host','editor'))
 or (scope='private' and public.member_user_id(owner_member_id) = auth.uid()));

create policy "split_select" on public.expense_splits for select using (
  exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));
-- splits are written only by the SECURITY DEFINER record_expense RPC; no direct write policy needed.

create policy "settle_select" on public.settlements for select using (public.is_trip_member(trip_id));
create policy "settle_insert" on public.settlements for insert with check (
  public.is_trip_member(trip_id) and (
    public.trip_role(trip_id) in ('host','editor')
    or public.member_user_id(from_member) = auth.uid()
    or public.member_user_id(to_member)   = auth.uid()));
create policy "settle_delete" on public.settlements for delete using (
  public.trip_role(trip_id) in ('host','editor')
  or public.member_user_id(from_member) = auth.uid()
  or public.member_user_id(to_member)   = auth.uid());

-- ── record_expense RPC (atomic expense + splits, balance-guarded) ─────────
create or replace function public.record_expense(
  p_expense_id uuid, p_trip_id uuid, p_description text, p_currency text, p_total numeric,
  p_paid_by uuid, p_category_id uuid, p_spent_on date, p_receipt_url text, p_splits jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sum numeric; v_id uuid;
begin
  if not (public.trip_role(p_trip_id) in ('host','editor')) then raise exception 'forbidden'; end if;
  select coalesce(sum((s->>'amount')::numeric),0) into v_sum from jsonb_array_elements(p_splits) s;
  if round(v_sum,2) <> round(p_total,2) then raise exception 'splits must equal total'; end if;

  if p_expense_id is null then
    insert into expenses (trip_id, scope, description, currency, total_amount, paid_by, category_id, spent_on, receipt_url, created_by)
    values (p_trip_id, 'team', p_description, p_currency, p_total, p_paid_by, p_category_id, p_spent_on, p_receipt_url,
            (select id from trip_members where trip_id = p_trip_id and user_id = auth.uid()))
    returning id into v_id;
  else
    update expenses set description=p_description, currency=p_currency, total_amount=p_total,
      paid_by=p_paid_by, category_id=p_category_id, spent_on=p_spent_on, receipt_url=p_receipt_url
    where id = p_expense_id and trip_id = p_trip_id returning id into v_id;
  end if;

  delete from expense_splits where expense_id = v_id;
  insert into expense_splits (expense_id, member_id, amount)
  select v_id, (s->>'member_id')::uuid, (s->>'amount')::numeric from jsonb_array_elements(p_splits) s;
  return v_id;
end $$;
grant execute on function public.record_expense(uuid,uuid,text,text,numeric,uuid,uuid,date,text,jsonb) to authenticated;
```

Expected: runs without error; the five tables appear with RLS enabled.

- [ ] **Step 2: Verify RLS/RPC by hand (two accounts, one shared trip)** — confirm:

| Check | Expect |
|---|---|
| Member selects team expenses/splits/settlements | visible |
| Member A selects Member B's `scope='private'` expense | denied (0 rows) |
| Owner selects their own private expense | visible |
| Viewer direct-inserts a team expense | denied |
| `select record_expense(null, '<trip>', 'Dinner','JPY',12000,'<m>',null,null,null,'[{"member_id":"<m>","amount":12000}]')` as host | returns id; splits inserted |
| Same RPC with splits summing to 11000 | error `splits must equal total` |
| Viewer calls `record_expense(...)` | error `forbidden` |
| Member inserts a settlement where they are `from_member` | allowed |
| Non-party viewer inserts a settlement between two others | denied |

- [ ] **Step 3:** No repo change in this task. Proceed to Task 2.

---

## Task 2: `lib/currencies.js` — currency config + formatting

**Files:** Create `src/lib/currencies.js`, `src/lib/currencies.test.js`.

- [ ] **Step 1: Write the failing test** — `src/lib/currencies.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { CURRENCIES, CURRENCY_CODES, currencyMeta, formatMoney } from './currencies'

describe('currencies', () => {
  it('includes the common trip currencies with symbol + name', () => {
    for (const code of ['MYR', 'JPY', 'USD', 'EUR']) {
      expect(CURRENCIES[code].symbol).toBeTruthy()
      expect(CURRENCIES[code].name).toBeTruthy()
    }
    expect(CURRENCY_CODES).toContain('MYR')
  })
  it('currencyMeta falls back to the code itself for an unknown currency', () => {
    expect(currencyMeta('ZZZ')).toEqual({ symbol: 'ZZZ', name: 'ZZZ' })
    expect(currencyMeta('JPY').symbol).toBe('¥')
  })
  it('formatMoney prefixes the symbol and groups thousands', () => {
    expect(formatMoney(12000, 'JPY')).toBe('¥12,000')
    expect(formatMoney(160, 'MYR')).toBe('RM160')
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.5')
    expect(formatMoney(null, 'JPY')).toBe('¥0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/currencies.test.js` → FAIL (module missing).

- [ ] **Step 3: Write minimal implementation** — `src/lib/currencies.js`:
```js
// Single source of truth: currency code → { symbol, name }. Drives the "Other" dropdown + all formatting.
export const CURRENCIES = {
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  THB: { symbol: '฿', name: 'Thai Baht' },
  KRW: { symbol: '₩', name: 'South Korean Won' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CNY: { symbol: 'CN¥', name: 'Chinese Yuan' },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah' },
  VND: { symbol: '₫', name: 'Vietnamese Dong' },
  TWD: { symbol: 'NT$', name: 'New Taiwan Dollar' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)

export function currencyMeta(code) {
  return CURRENCIES[code] ?? { symbol: code, name: code }
}

// "¥12,000" / "RM160". No forced decimals; up to 2 shown when present.
export function formatMoney(amount, code) {
  const n = Number(amount ?? 0)
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${currencyMeta(code).symbol}${s}`
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/currencies.test.js` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/currencies.js src/lib/currencies.test.js
git commit -m "feat: currency config + formatMoney (finance 5a)"
```

---

## Task 3: `lib/expenses.js` — split helpers

**Files:** Create `src/lib/expenses.js`, `src/lib/expenses.test.js`.

- [ ] **Step 1: Write the failing test** — `src/lib/expenses.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { equalSplit, splitsBalance, groupByCurrency, myShare } from './expenses'

describe('equalSplit', () => {
  it('splits evenly and pushes the rounding remainder to the first members', () => {
    const s = equalSplit(10, ['a', 'b', 'c'])
    expect(s.map((x) => x.amount)).toEqual([3.34, 3.33, 3.33])
    expect(s.reduce((t, x) => t + x.amount, 0)).toBeCloseTo(10, 5)
  })
  it('returns [] for no members', () => { expect(equalSplit(10, [])).toEqual([]) })
})
describe('splitsBalance', () => {
  it('is true only when splits sum to the total (within a cent)', () => {
    expect(splitsBalance(12000, [{ amount: 3000 }, { amount: 9000 }])).toBe(true)
    expect(splitsBalance(12000, [{ amount: 3000 }, { amount: 8000 }])).toBe(false)
  })
})
describe('groupByCurrency', () => {
  it('buckets expenses by currency code', () => {
    const g = groupByCurrency([{ id: 1, currency: 'JPY' }, { id: 2, currency: 'MYR' }, { id: 3, currency: 'JPY' }])
    expect(g.JPY.map((e) => e.id)).toEqual([1, 3])
    expect(g.MYR.map((e) => e.id)).toEqual([2])
  })
})
describe('myShare', () => {
  it('sums a member\'s split amounts', () => {
    expect(myShare([{ member_id: 'a', amount: 3000 }, { member_id: 'b', amount: 9000 }], 'a')).toBe(3000)
    expect(myShare([], 'a')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/expenses.test.js` → FAIL.

- [ ] **Step 3: Write minimal implementation** — `src/lib/expenses.js`:
```js
// Even split of `total` across memberIds (2 dp); rounding remainder goes to the first members.
export function equalSplit(total, memberIds) {
  const n = memberIds.length
  if (!n) return []
  const cents = Math.round(Number(total) * 100)
  const base = Math.floor(cents / n)
  let rem = cents - base * n
  return memberIds.map((id) => {
    const amt = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
    return { member_id: id, amount: amt / 100 }
  })
}

// Do the split amounts sum to the total (within a cent)? The save guard.
export function splitsBalance(total, splits) {
  const sum = (splits ?? []).reduce((a, s) => a + Number(s.amount || 0), 0)
  return Math.abs(sum - Number(total || 0)) < 0.005
}

// { [currencyCode]: expenses[] }
export function groupByCurrency(expenses) {
  const out = {}
  for (const e of expenses ?? []) (out[e.currency] ??= []).push(e)
  return out
}

// A member's share of one expense from its split rows.
export function myShare(splits, memberId) {
  return (splits ?? []).filter((s) => s.member_id === memberId).reduce((a, s) => a + Number(s.amount || 0), 0)
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/expenses.test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/expenses.js src/lib/expenses.test.js
git commit -m "feat: pure split helpers (finance 5a)"
```

---

## Task 4: `lib/balances.js` — net balances + greedy settle-up

**Files:** Create `src/lib/balances.js`, `src/lib/balances.test.js`.

- [ ] **Step 1: Write the failing test** — `src/lib/balances.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { netByMember, simplify, pairwiseDebts, myDebts } from './balances'

// A paid 12000, split equally among A,B,C,D (3000 each) → B,C,D each owe A 3000.
const expenses = [{
  id: 'e1', paid_by: 'A', total_amount: 12000,
  splits: [{ member_id: 'A', amount: 3000 }, { member_id: 'B', amount: 3000 }, { member_id: 'C', amount: 3000 }, { member_id: 'D', amount: 3000 }],
}]

describe('netByMember', () => {
  it('nets paid minus owed per member', () => {
    const net = netByMember(expenses, [])
    expect(net.get('A')).toBe(9000)
    expect(net.get('B')).toBe(-3000)
  })
  it('applies settlements toward zero', () => {
    const net = netByMember(expenses, [{ from_member: 'B', to_member: 'A', amount: 3000 }])
    expect(net.get('B')).toBe(0)
    expect(net.get('A')).toBe(6000)
  })
})
describe('simplify / pairwiseDebts', () => {
  it('produces minimal debtor→creditor transactions', () => {
    const debts = pairwiseDebts(expenses, [])
    expect(debts).toHaveLength(3)
    for (const d of debts) { expect(d.to).toBe('A'); expect(d.amount).toBe(3000) }
  })
  it('drops a debt fully covered by a settlement', () => {
    const debts = pairwiseDebts(expenses, [{ from_member: 'B', to_member: 'A', amount: 3000 }])
    expect(debts.find((d) => d.from === 'B')).toBeUndefined()
    expect(debts).toHaveLength(2)
  })
})
describe('myDebts', () => {
  it('filters to debts the member is party to', () => {
    const debts = [{ from: 'B', to: 'A', amount: 3000 }, { from: 'C', to: 'A', amount: 3000 }]
    expect(myDebts(debts, 'B')).toEqual([{ from: 'B', to: 'A', amount: 3000 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/balances.test.js` → FAIL.

- [ ] **Step 3: Write minimal implementation** — `src/lib/balances.js`:
```js
// Net per member for ONE currency: +ve = others owe them. Expenses: {paid_by, total_amount, splits:[{member_id,amount}]}.
export function netByMember(expenses, settlements) {
  const net = new Map()
  const add = (id, v) => { if (id != null) net.set(id, (net.get(id) ?? 0) + v) }
  for (const e of expenses ?? []) {
    add(e.paid_by, Number(e.total_amount))
    for (const s of e.splits ?? []) add(s.member_id, -Number(s.amount))
  }
  for (const st of settlements ?? []) { add(st.from_member, Number(st.amount)); add(st.to_member, -Number(st.amount)) }
  return net
}

// Greedy minimal transactions from a net map → [{from, to, amount}].
export function simplify(net) {
  const debtors = [], creditors = []
  for (const [id, v] of net) {
    const r = Math.round(v * 100) / 100
    if (r < -0.005) debtors.push({ id, amt: -r })
    else if (r > 0.005) creditors.push({ id, amt: r })
  }
  debtors.sort((a, b) => b.amt - a.amt)
  creditors.sort((a, b) => b.amt - a.amt)
  const out = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.round(Math.min(debtors[i].amt, creditors[j].amt) * 100) / 100
    out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay })
    debtors[i].amt -= pay
    creditors[j].amt -= pay
    if (debtors[i].amt < 0.005) i++
    if (creditors[j].amt < 0.005) j++
  }
  return out
}

export function pairwiseDebts(expenses, settlements) {
  return simplify(netByMember(expenses, settlements))
}

export function myDebts(debts, memberId) {
  return (debts ?? []).filter((d) => d.from === memberId || d.to === memberId)
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/balances.test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/balances.js src/lib/balances.test.js
git commit -m "feat: per-currency balances + greedy settle-up (finance 5a)"
```

---

## Task 5: Trip currencies on create — `useCreateTrip` + `CreateTripModal`

**Files:** Modify `src/hooks/useCreateTrip.js`, `src/hooks/useCreateTrip.test.jsx`, `src/components/CreateTripModal.jsx`, `src/components/CreateTripModal.test.jsx`.

> Prereq: the `create_trip` RPC must accept `p_departure_currency` / `p_destination_currency`. Add this in the Supabase SQL editor (or fold into Task 1) before Step 4:
> ```sql
> -- extend create_trip: add two params, store into the new trips columns.
> -- (Recreate the function with the two extra text params defaulting to null,
> --  setting departure_currency/destination_currency on the inserted trips row.)
> ```

- [ ] **Step 1: Update the hook test** — in `src/hooks/useCreateTrip.test.jsx`, find the `expect(...rpc...).toHaveBeenCalledWith('create_trip', ...)` assertion and extend the expected object to include `p_departure_currency: 'MYR'` and `p_destination_currency: 'JPY'`; pass them in the `mutate(...)` call as `departureCurrency: 'MYR', destinationCurrency: 'JPY'`. (If the test doesn't assert rpc args yet, add: after a successful mutate with those fields, `expect(rpc).toHaveBeenCalledWith('create_trip', expect.objectContaining({ p_departure_currency: 'MYR', p_destination_currency: 'JPY' }))`.)

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/useCreateTrip.test.jsx` → FAIL.

- [ ] **Step 3: Pass the params in the hook** — in `src/hooks/useCreateTrip.js`, change the `mutationFn` signature + rpc args:
```js
    mutationFn: async ({ name, place, startDate, endDate, departureCurrency, destinationCurrency }) => {
      const { data, error } = await supabase.rpc('create_trip', {
        p_name: name,
        p_place: place,
        p_start: startDate,
        p_end: endDate,
        p_departure_currency: departureCurrency,
        p_destination_currency: destinationCurrency,
      })
      if (error) throw error
      return data
    },
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/hooks/useCreateTrip.test.jsx` → PASS.

- [ ] **Step 5: Add the modal test** — in `src/components/CreateTripModal.test.jsx`, add a test that fills name/place/dates, selects a departure + destination currency, submits, and asserts the mutate payload includes `departureCurrency` + `destinationCurrency`. Example addition:
```js
it('submits the chosen currencies', async () => {
  render(<CreateTripModal isOpen onClose={vi.fn()} />)
  await userEvent.type(screen.getByLabelText(/trip name/i), 'Tokyo')
  await userEvent.type(screen.getByLabelText(/place/i), 'Japan')
  await userEvent.type(screen.getByLabelText(/start date/i), '2026-11-08')
  await userEvent.type(screen.getByLabelText(/end date/i), '2026-11-15')
  await userEvent.selectOptions(screen.getByLabelText(/home currency/i), 'MYR')
  await userEvent.selectOptions(screen.getByLabelText(/destination currency/i), 'JPY')
  await userEvent.click(screen.getByRole('button', { name: /create trip/i }))
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({ departureCurrency: 'MYR', destinationCurrency: 'JPY' }),
    expect.any(Object),
  )
})
```
(Follow the existing mock in this file: `useCreateTrip` is mocked to return `{ mutate, isPending: false }`. If it isn't yet, add `const mutate = vi.fn(); vi.mock('../hooks/useCreateTrip', () => ({ useCreateTrip: () => ({ mutate, isPending: false }) }))` at the top and `beforeEach(() => vi.clearAllMocks())`.)

- [ ] **Step 6: Run test to verify it fails** — `npx vitest run src/components/CreateTripModal.test.jsx` → FAIL.

- [ ] **Step 7: Add the two selects to the modal** — in `src/components/CreateTripModal.jsx`:
  - Import currencies: `import { CURRENCY_CODES, currencyMeta } from '../lib/currencies'`
  - Extend `EMPTY`: `const EMPTY = { name: '', place: '', startDate: '', endDate: '', departureCurrency: 'MYR', destinationCurrency: 'JPY' }`
  - After the dates `row`, add:
```jsx
          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="t-dep">Home currency</label>
              <select id="t-dep" className={styles.input} value={form.departureCurrency} onChange={set('departureCurrency')}>
                {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} — {currencyMeta(c).name}</option>)}
              </select>
            </div>
            <div className={styles.col}>
              <label className={styles.label} htmlFor="t-dest">Destination currency</label>
              <select id="t-dest" className={styles.input} value={form.destinationCurrency} onChange={set('destinationCurrency')}>
                {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} — {currencyMeta(c).name}</option>)}
              </select>
            </div>
          </div>
```
  - Include the two fields in the `mutate` payload: add `departureCurrency: form.departureCurrency, destinationCurrency: form.destinationCurrency` to the object passed to `mutate`.

- [ ] **Step 8: Run test to verify it passes** — `npx vitest run src/components/CreateTripModal.test.jsx` → PASS.

- [ ] **Step 9: Commit**
```bash
git add src/hooks/useCreateTrip.js src/hooks/useCreateTrip.test.jsx src/components/CreateTripModal.jsx src/components/CreateTripModal.test.jsx
git commit -m "feat: pick departure + destination currency on trip create (finance 5a)"
```

---

## Task 6: Edit trip currencies — `useUpdateTrip` + `EditTripModal`

Also serves the "set your currencies" path for legacy trips (host/editor opens trip edit).

**Files:** Modify `src/hooks/useUpdateTrip.js` (allow the two columns), `src/components/EditTripModal.jsx` + `.test.jsx`.

- [ ] **Step 1: Confirm `useUpdateTrip` passes through arbitrary columns** — Read `src/hooks/useUpdateTrip.js`. It does `update({ name, place, start_date, end_date })`. Extend it to also set `departure_currency` and `destination_currency` when present in the payload.

- [ ] **Step 2: Add the modal test** — in `src/components/EditTripModal.test.jsx`, add:
```js
it('lets the host change the trip currencies', async () => {
  render(<EditTripModal isOpen trip={{ id: 't1', name: 'Tokyo', place: 'Japan', start_date: '2026-11-08', end_date: '2026-11-15', departure_currency: 'MYR', destination_currency: 'JPY' }} onClose={vi.fn()} />)
  await userEvent.selectOptions(screen.getByLabelText(/destination currency/i), 'THB')
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ destination_currency: 'THB' }), expect.any(Object))
})
```
(Match the file's existing `useUpdateTrip` mock + prop shape; if the modal takes `trip` differently, mirror that.)

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run src/components/EditTripModal.test.jsx` → FAIL.

- [ ] **Step 4: Add the two selects to `EditTripModal`** — mirror Task 5 Step 7 (two `<select>`s bound to `departure_currency` / `destination_currency` seeded from `trip.*`, default `'MYR'`/`'JPY'` when null), and include both in the `mutate` payload.

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run src/components/EditTripModal.test.jsx` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/hooks/useUpdateTrip.js src/components/EditTripModal.jsx src/components/EditTripModal.test.jsx
git commit -m "feat: edit trip currencies (finance 5a)"
```

---

## Task 7: `useTrip` — embed finance rows

**Files:** Modify `src/hooks/useTrip.js`, `src/hooks/useTrip.test.jsx`.

- [ ] **Step 1: Update the test** — in `src/hooks/useTrip.test.jsx`, after the `packing_items` assertion add:
```js
    expect(select).toHaveBeenCalledWith(expect.stringContaining('expenses'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('settlements'))
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/useTrip.test.jsx` → FAIL.

- [ ] **Step 3: Extend the select** — in `src/hooks/useTrip.js`, append to `TRIP_SELECT`:
```js
const TRIP_SELECT =
  '*, trip_members(id, user_id, display_name, role, invite_status, profiles(display_name, avatar_url)), transport(*), plan_items(*), packing_items(*), expenses(*, expense_splits(*)), budget_categories(*, category_budgets(*)), settlements(*)'
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/hooks/useTrip.test.jsx` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useTrip.js src/hooks/useTrip.test.jsx
git commit -m "feat: embed expenses/splits/settlements in the trip query (finance 5a)"
```

---

## Task 8: `useUpsertExpense`

**Files:** Create `src/hooks/useUpsertExpense.js`, `src/hooks/useUpsertExpense.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/hooks/useUpsertExpense.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { rpc, insert, from } = vi.hoisted(() => {
  const rpc = vi.fn()
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { rpc, insert, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc, from } }))

import { useUpsertExpense } from './useUpsertExpense'
function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useUpsertExpense', () => {
  it('records a team expense via the RPC with mapped params', async () => {
    rpc.mockResolvedValue({ data: 'e1', error: null })
    const { result } = renderHook(() => useUpsertExpense('t1'), { wrapper })
    result.current.mutate({
      scope: 'team', description: 'Dinner', currency: 'JPY', total_amount: 12000,
      paid_by: 'm1', category_id: null, spent_on: '2026-11-09',
      splits: [{ member_id: 'm1', amount: 12000 }],
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith('record_expense', expect.objectContaining({
      p_trip_id: 't1', p_currency: 'JPY', p_total: 12000, p_paid_by: 'm1',
      p_splits: [{ member_id: 'm1', amount: 12000 }], p_expense_id: null,
    }))
  })
  it('inserts a private expense directly (no RPC)', async () => {
    insert.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useUpsertExpense('t1'), { wrapper })
    result.current.mutate({ scope: 'private', description: 'Souvenir', currency: 'JPY', total_amount: 3700, owner_member_id: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('expenses')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', scope: 'private', owner_member_id: 'm1' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/hooks/useUpsertExpense.test.jsx` → FAIL.

- [ ] **Step 3: Write minimal implementation** — `src/hooks/useUpsertExpense.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useUpsertExpense(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      if (input.scope === 'team') {
        const { error } = await supabase.rpc('record_expense', {
          p_expense_id: input.id ?? null,
          p_trip_id: tripId,
          p_description: input.description,
          p_currency: input.currency,
          p_total: input.total_amount,
          p_paid_by: input.paid_by,
          p_category_id: input.category_id ?? null,
          p_spent_on: input.spent_on ?? null,
          p_receipt_url: input.receipt_url ?? null,
          p_splits: input.splits,
        })
        if (error) throw error
        return
      }
      const { id, ...fields } = input
      const query = id
        ? supabase.from('expenses').update(fields).eq('id', id)
        : supabase.from('expenses').insert({ ...fields, trip_id: tripId })
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/hooks/useUpsertExpense.test.jsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useUpsertExpense.js src/hooks/useUpsertExpense.test.jsx
git commit -m "feat: useUpsertExpense (team RPC / private insert) (finance 5a)"
```

---

## Task 9: `useDeleteExpense` + `useSettleDebt`

**Files:** Create `src/hooks/useDeleteExpense.js` + `.test.jsx`, `src/hooks/useSettleDebt.js` + `.test.jsx`.

- [ ] **Step 1: Write the failing tests**

`src/hooks/useDeleteExpense.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const { eq, del, from } = vi.hoisted(() => {
  const eq = vi.fn(); const del = vi.fn(() => ({ eq })); const from = vi.fn(() => ({ delete: del }))
  return { eq, del, from }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
import { useDeleteExpense } from './useDeleteExpense'
function wrapper({ children }) { const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return <QueryClientProvider client={c}>{children}</QueryClientProvider> }
beforeEach(() => vi.clearAllMocks())
describe('useDeleteExpense', () => {
  it('deletes by id from expenses', async () => {
    eq.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useDeleteExpense('t1'), { wrapper })
    result.current.mutate('e1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('expenses'); expect(eq).toHaveBeenCalledWith('id', 'e1')
  })
})
```

`src/hooks/useSettleDebt.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const { insert, from } = vi.hoisted(() => { const insert = vi.fn(); const from = vi.fn(() => ({ insert })); return { insert, from } })
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
import { useSettleDebt } from './useSettleDebt'
function wrapper({ children }) { const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return <QueryClientProvider client={c}>{children}</QueryClientProvider> }
beforeEach(() => vi.clearAllMocks())
describe('useSettleDebt', () => {
  it('inserts a settlement row for the debt', async () => {
    insert.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useSettleDebt('t1'), { wrapper })
    result.current.mutate({ from_member: 'B', to_member: 'A', currency: 'JPY', amount: 3000, createdBy: 'B' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('settlements')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', from_member: 'B', to_member: 'A', currency: 'JPY', amount: 3000, created_by: 'B' }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/hooks/useDeleteExpense.test.jsx src/hooks/useSettleDebt.test.jsx` → FAIL.

- [ ] **Step 3: Write implementations**

`src/hooks/useDeleteExpense.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
export function useDeleteExpense(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

`src/hooks/useSettleDebt.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
export function useSettleDebt(tripId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ from_member, to_member, currency, amount, createdBy }) => {
      const { error } = await supabase.from('settlements').insert({
        trip_id: tripId, from_member, to_member, currency, amount, created_by: createdBy ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
  })
}
```

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run src/hooks/useDeleteExpense.test.jsx src/hooks/useSettleDebt.test.jsx` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useDeleteExpense.js src/hooks/useDeleteExpense.test.jsx src/hooks/useSettleDebt.js src/hooks/useSettleDebt.test.jsx
git commit -m "feat: useDeleteExpense + useSettleDebt (finance 5a)"
```

---

## Task 10: `ExpenseRow`

**Files:** Create `src/components/ExpenseRow.jsx`, `.module.css`, `.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/components/ExpenseRow.test.jsx`:
```js
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExpenseRow } from './ExpenseRow'

const exp = { id: 'e1', description: 'Ichiran dinner', currency: 'JPY', total_amount: 12000, paid_by: 'm1', spent_on: '2026-11-09' }

describe('ExpenseRow', () => {
  it('shows description, formatted amount, payer name and split count', () => {
    render(<ExpenseRow expense={exp} paidByName="Hui" splitCount={4} hasReceipt canManage={false} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Ichiran dinner')).toBeInTheDocument()
    expect(screen.getByText('¥12,000')).toBeInTheDocument()
    expect(screen.getByText(/Hui/)).toBeInTheDocument()
    expect(screen.getByText(/split 4 ways/i)).toBeInTheDocument()
  })
  it('shows edit/remove only when canManage', async () => {
    const onEdit = vi.fn(), onRemove = vi.fn()
    const { rerender } = render(<ExpenseRow expense={exp} paidByName="Hui" splitCount={4} canManage={false} onEdit={onEdit} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: /edit ichiran/i })).not.toBeInTheDocument()
    rerender(<ExpenseRow expense={exp} paidByName="Hui" splitCount={4} canManage onEdit={onEdit} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /edit ichiran/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove ichiran/i }))
    expect(onEdit).toHaveBeenCalledWith(exp); expect(onRemove).toHaveBeenCalledWith(exp)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/ExpenseRow.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/ExpenseRow.jsx`:
```js
import { formatMoney } from '../lib/currencies'
import styles from './ExpenseRow.module.css'

export function ExpenseRow({ expense, paidByName, splitCount, hasReceipt, canManage, onEdit, onRemove }) {
  return (
    <div className={styles.row}>
      <div className={styles.main}>
        <div className={styles.t}>{expense.description}</div>
        <div className={styles.sub}>
          paid by {paidByName} · split {splitCount} way{splitCount === 1 ? '' : 's'}
          {expense.spent_on ? ` · ${expense.spent_on}` : ''}
        </div>
      </div>
      {hasReceipt && <span className={styles.rcpt} aria-label="receipt attached">📎</span>}
      <div className={styles.amt}>{formatMoney(expense.total_amount, expense.currency)}</div>
      {canManage && (
        <span className={styles.act}>
          <button type="button" aria-label={`Edit ${expense.description}`} onClick={(e) => { e.stopPropagation(); onEdit(expense) }}>✎</button>
          <button type="button" aria-label={`Remove ${expense.description}`} onClick={(e) => { e.stopPropagation(); onRemove(expense) }}>✕</button>
        </span>
      )}
    </div>
  )
}
```

`src/components/ExpenseRow.module.css`:
```css
.row { display: flex; align-items: center; gap: var(--space-3); padding: 12px var(--space-5); border-top: 1px solid #f1f6fb; }
.row:first-child { border-top: 0; }
.main { min-width: 0; }
.t { font-size: 14px; font-weight: 600; }
.sub { font-size: 11.5px; color: var(--ink-muted); margin-top: 2px; }
.rcpt { font-size: 13px; }
.amt { margin-left: auto; font-family: var(--font-mono); font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
.act { display: inline-flex; gap: 2px; }
.act button { border: 0; background: transparent; color: var(--ink-muted); cursor: pointer; font-size: 13px; padding: 4px; border-radius: 6px; }
.act button:hover { background: var(--c-mist); color: var(--ink); }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/ExpenseRow.test.jsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/ExpenseRow.jsx src/components/ExpenseRow.module.css src/components/ExpenseRow.test.jsx
git commit -m "feat: ExpenseRow (finance 5a)"
```

---

## Task 11: `ExpenseEditorModal` (team) — the balance-guarded form

**Files:** Create `src/components/ExpenseEditorModal.jsx`, `.module.css`, `.test.jsx`.

Props: `tripId`, `trip` (for members, currencies, categories), `memberId` (caller's member id), `expense` (edit) or null, `onClose`. Team-scope only in 5a.

- [ ] **Step 1: Write the failing test** — `src/components/ExpenseEditorModal.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutate = vi.fn()
vi.mock('../hooks/useUpsertExpense', () => ({ useUpsertExpense: () => ({ mutate, isPending: false }) }))
import { ExpenseEditorModal } from './ExpenseEditorModal'

const trip = {
  id: 't1', departure_currency: 'MYR', destination_currency: 'JPY',
  trip_members: [
    { id: 'm1', user_id: 'u1', display_name: 'Hui' },
    { id: 'm2', user_id: 'u2', display_name: 'Sara' },
  ],
  budget_categories: [{ id: 'c1', name: 'Meal' }],
}
beforeEach(() => vi.clearAllMocks())

describe('ExpenseEditorModal', () => {
  it('defaults to an equal, balanced split and saves via mutate', async () => {
    render(<ExpenseEditorModal tripId="t1" trip={trip} memberId="m1" expense={null} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/description/i), 'Dinner')
    await userEvent.clear(screen.getByLabelText(/total/i))
    await userEvent.type(screen.getByLabelText(/total/i), '12000')
    await userEvent.click(screen.getByRole('button', { name: /split equally/i }))
    await userEvent.click(screen.getByRole('button', { name: /save expense/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'team', currency: 'JPY', total_amount: 12000, splits: expect.any(Array) }),
      expect.any(Object),
    )
    const arg = mutate.mock.calls[0][0]
    expect(arg.splits.reduce((t, s) => t + s.amount, 0)).toBeCloseTo(12000, 2)
  })
  it('disables Save when the split does not sum to the total', async () => {
    render(<ExpenseEditorModal tripId="t1" trip={trip} memberId="m1" expense={null} onClose={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText(/total/i))
    await userEvent.type(screen.getByLabelText(/total/i), '12000')
    await userEvent.click(screen.getByRole('button', { name: /split equally/i }))
    // break the balance: zero out one participant's amount
    const first = screen.getAllByLabelText(/split amount/i)[0]
    await userEvent.clear(first); await userEvent.type(first, '0')
    expect(screen.getByRole('button', { name: /save expense/i })).toBeDisabled()
  })
  it('switches currency via the Departure/Destination/Other field', async () => {
    render(<ExpenseEditorModal tripId="t1" trip={trip} memberId="m1" expense={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /departure/i }))
    await userEvent.clear(screen.getByLabelText(/total/i)); await userEvent.type(screen.getByLabelText(/total/i), '100')
    await userEvent.click(screen.getByRole('button', { name: /split equally/i }))
    await userEvent.type(screen.getByLabelText(/description/i), 'SIM')
    await userEvent.click(screen.getByRole('button', { name: /save expense/i }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'MYR' }), expect.any(Object))
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/ExpenseEditorModal.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/ExpenseEditorModal.jsx`:
```js
import { useState } from 'react'
import { Modal } from './Modal'
import { CURRENCY_CODES, currencyMeta, formatMoney } from '../lib/currencies'
import { memberName } from '../lib/display'
import { equalSplit, splitsBalance } from '../lib/expenses'
import { useUpsertExpense } from '../hooks/useUpsertExpense'
import styles from './ExpenseEditorModal.module.css'

export function ExpenseEditorModal({ tripId, trip, memberId, expense, onClose }) {
  const members = trip.trip_members ?? []
  const cats = trip.budget_categories ?? []
  const dep = trip.departure_currency ?? 'MYR'
  const dest = trip.destination_currency ?? 'JPY'
  const isEdit = !!expense?.id

  const initialSplits = () => {
    const map = new Map((expense?.expense_splits ?? []).map((s) => [s.member_id, Number(s.amount)]))
    return members.map((m) => ({ member_id: m.id, on: expense ? map.has(m.id) : true, amount: map.get(m.id) ?? 0 }))
  }
  const [desc, setDesc] = useState(expense?.description ?? '')
  const [currency, setCurrency] = useState(expense?.currency ?? dest)
  const [total, setTotal] = useState(expense?.total_amount ?? '')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? memberId ?? members[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? '')
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? '')
  const [rows, setRows] = useState(initialSplits)
  const [showOther, setShowOther] = useState(![dep, dest].includes(expense?.currency ?? dest))
  const [error, setError] = useState('')
  const upsert = useUpsertExpense(tripId)

  const activeSplits = rows.filter((r) => r.on).map((r) => ({ member_id: r.member_id, amount: Number(r.amount) || 0 }))
  const balanced = splitsBalance(Number(total) || 0, activeSplits) && activeSplits.length > 0

  function splitEqually() {
    const ids = rows.filter((r) => r.on).map((r) => r.member_id)
    const eq = equalSplit(Number(total) || 0, ids)
    const amt = new Map(eq.map((e) => [e.member_id, e.amount]))
    setRows((rs) => rs.map((r) => ({ ...r, amount: r.on ? (amt.get(r.member_id) ?? 0) : 0 })))
  }
  const setAmount = (id) => (e) => setRows((rs) => rs.map((r) => (r.member_id === id ? { ...r, amount: e.target.value } : r)))
  const toggle = (id) => setRows((rs) => rs.map((r) => (r.member_id === id ? { ...r, on: !r.on, amount: r.on ? 0 : r.amount } : r)))

  function pickCurrency(code, other) { setCurrency(code); setShowOther(other) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!desc.trim()) { setError('A description is required.'); return }
    if (!balanced) { setError('The split must add up to the total.'); return }
    setError('')
    upsert.mutate(
      {
        ...(isEdit ? { id: expense.id } : {}),
        scope: 'team', description: desc.trim(), currency, total_amount: Number(total),
        paid_by: paidBy, category_id: categoryId || null, spent_on: spentOn || null,
        splits: activeSplits,
      },
      { onSuccess: onClose, onError: () => setError('Could not save. Please try again.') },
    )
  }

  const sym = currencyMeta(currency).symbol
  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit expense' : 'Add expense'}>
      <form className={styles.pad} noValidate onSubmit={handleSubmit}>
        <p className={styles.ey}>{isEdit ? 'EDIT TEAM EXPENSE' : 'NEW TEAM EXPENSE'}</p>

        <label className={styles.label} htmlFor="x-desc">Description</label>
        <input id="x-desc" className={styles.input} value={desc} onChange={(e) => setDesc(e.target.value)} />

        <span className={styles.label} id="x-cur">Currency</span>
        <div className={styles.chips} role="group" aria-labelledby="x-cur">
          <button type="button" className={`${styles.chip} ${currency === dep && !showOther ? styles.on : ''}`} onClick={() => pickCurrency(dep, false)}>🏠 Departure · {dep}</button>
          <button type="button" className={`${styles.chip} ${currency === dest && !showOther ? styles.on : ''}`} onClick={() => pickCurrency(dest, false)}>📍 Destination · {dest}</button>
          <button type="button" className={`${styles.chip} ${showOther ? styles.on : ''}`} onClick={() => pickCurrency(CURRENCY_CODES.find((c) => c !== dep && c !== dest) ?? 'USD', true)}>🌐 Other</button>
        </div>
        {showOther && (
          <select className={styles.input} aria-label="Other currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} — {currencyMeta(c).name}</option>)}
          </select>
        )}

        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="x-total">Total ({sym})</label>
            <input id="x-total" type="number" min="0" step="0.01" className={styles.input} value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="x-paid">Paid by</label>
            <select id="x-paid" className={styles.input} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {members.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="x-cat">Category · optional</label>
            <select id="x-cat" className={styles.input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className={styles.col}>
            <label className={styles.label} htmlFor="x-date">Date · optional</label>
            <input id="x-date" type="date" className={styles.input} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
          </div>
        </div>

        <div className={styles.splithead}>
          <span className={styles.label} style={{ margin: 0 }}>Split among</span>
          <button type="button" className={styles.eq} onClick={splitEqually}>↺ Split equally</button>
        </div>
        {rows.map((r) => {
          const m = members.find((x) => x.id === r.member_id)
          return (
            <div key={r.member_id} className={`${styles.prow} ${r.on ? '' : styles.off}`}>
              <button type="button" className={`${styles.cbox} ${r.on ? styles.cboxOn : ''}`} aria-label={`Include ${memberName(m)}`} aria-pressed={r.on} onClick={() => toggle(r.member_id)}>{r.on ? '✓' : ''}</button>
              <span className={styles.pname}>{memberName(m)}</span>
              <input type="number" min="0" step="0.01" className={styles.pamt} aria-label={`Split amount for ${memberName(m)}`} value={r.amount} disabled={!r.on} onChange={setAmount(r.member_id)} />
            </div>
          )
        })}

        <div className={`${styles.balance} ${balanced ? styles.ok : styles.bad}`}>
          <span>{balanced ? 'Balanced' : 'Off by ' + formatMoney(Math.abs(activeSplits.reduce((t, s) => t + s.amount, 0) - (Number(total) || 0)), currency)}</span>
          <span className={styles.balnum}>{formatMoney(activeSplits.reduce((t, s) => t + s.amount, 0), currency)} / {formatMoney(Number(total) || 0, currency)}</span>
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submit} disabled={!balanced || upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save expense'}</button>
        </div>
      </form>
    </Modal>
  )
}
```

`src/components/ExpenseEditorModal.module.css`:
```css
.pad { padding: var(--space-5); display: flex; flex-direction: column; }
.ey { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); margin: 0 0 var(--space-3); }
.label { font-size: 12px; font-weight: 600; color: var(--ink-muted); margin: var(--space-3) 0 var(--space-1); }
.input { font: inherit; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: #fff; color: var(--ink); }
.input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.row { display: flex; gap: var(--space-3); }
.col { flex: 1; display: flex; flex-direction: column; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 11px; border-radius: 999px; border: 1.5px solid var(--border); background: #fff; color: var(--ink-muted); cursor: pointer; }
.chip.on { background: var(--c-mist); color: var(--primary-strong); border-color: var(--c-sky-100); }
.splithead { display: flex; align-items: center; margin: var(--space-4) 0 var(--space-1); }
.eq { margin-left: auto; font: inherit; font-size: 11.5px; font-weight: 600; color: var(--primary-strong); background: #fff; border: 1.5px solid var(--border); border-radius: 999px; padding: 4px 11px; cursor: pointer; }
.prow { display: flex; align-items: center; gap: var(--space-3); padding: 7px 0; border-top: 1px solid #f1f6fb; }
.prow.off { opacity: .5; }
.cbox { width: 18px; height: 18px; flex: none; border-radius: 5px; border: 2px solid var(--c-sky-100); background: #fff; color: #fff; font-size: 11px; font-weight: 900; display: grid; place-items: center; cursor: pointer; }
.cboxOn { background: var(--primary); border-color: var(--primary); }
.pname { font-size: 13.5px; }
.pamt { margin-left: auto; width: 120px; text-align: right; font: inherit; font-family: var(--font-mono); font-weight: 700; padding: 7px 10px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); }
.balance { display: flex; align-items: center; gap: 10px; margin-top: var(--space-4); padding: 10px 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600; }
.balance.ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.balance.bad { background: #fef2f2; color: var(--c-danger); border: 1px solid #fecaca; }
.balnum { margin-left: auto; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.error { color: var(--c-danger); font-size: 13px; margin: var(--space-3) 0 0; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
.cancel, .submit { font: inherit; font-weight: 600; padding: 10px 18px; border-radius: var(--radius-sm); cursor: pointer; border: 1.5px solid var(--border); }
.cancel { background: #fff; color: var(--ink); }
.submit { background: var(--accent); border-color: var(--accent); color: #fff; }
.submit:disabled { opacity: .5; cursor: not-allowed; background: var(--c-slate); border-color: var(--c-slate); }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/ExpenseEditorModal.test.jsx` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/ExpenseEditorModal.jsx src/components/ExpenseEditorModal.module.css src/components/ExpenseEditorModal.test.jsx
git commit -m "feat: ExpenseEditorModal with balance guard (finance 5a)"
```

---

## Task 12: `BalancePanel` — per-currency settle-up

**Files:** Create `src/components/BalancePanel.jsx`, `.module.css`, `.test.jsx`.

Takes the trip's team expenses (with splits) + settlements + members + caller info; computes per-currency
pairwise debts and renders each with a ✓ settle button (enabled for the two involved or host/editor).

- [ ] **Step 1: Write the failing test** — `src/components/BalancePanel.test.jsx`:
```js
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BalancePanel } from './BalancePanel'

const members = [{ id: 'A', display_name: 'Ana' }, { id: 'B', display_name: 'Ben' }]
const expenses = [{
  id: 'e1', scope: 'team', currency: 'JPY', paid_by: 'A', total_amount: 6000,
  expense_splits: [{ member_id: 'A', amount: 3000 }, { member_id: 'B', amount: 3000 }],
}]

describe('BalancePanel', () => {
  it('renders a per-currency debt B → A and fires onSettle', async () => {
    const onSettle = vi.fn()
    render(<BalancePanel expenses={expenses} settlements={[]} members={members} canSettle={() => true} onSettle={onSettle} />)
    expect(screen.getByText(/JPY/i)).toBeInTheDocument()
    expect(screen.getByText('¥3,000')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /settle/i }))
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ from: 'B', to: 'A', amount: 3000, currency: 'JPY' }))
  })
  it('shows an all-settled note when there are no debts', () => {
    render(<BalancePanel expenses={[]} settlements={[]} members={members} canSettle={() => true} onSettle={vi.fn()} />)
    expect(screen.getByText(/all settled/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/BalancePanel.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/components/BalancePanel.jsx`:
```js
import { formatMoney } from '../lib/currencies'
import { groupByCurrency } from '../lib/expenses'
import { pairwiseDebts } from '../lib/balances'
import { memberName } from '../lib/display'
import styles from './BalancePanel.module.css'

// expenses have `expense_splits`; balances need `splits`. Normalize per currency.
function debtsByCurrency(expenses, settlements) {
  const byCur = groupByCurrency(expenses)
  const settleByCur = groupByCurrency(settlements)
  return Object.keys(byCur).sort().map((cur) => {
    const norm = byCur[cur].map((e) => ({ paid_by: e.paid_by, total_amount: e.total_amount, splits: e.expense_splits ?? [] }))
    return { currency: cur, debts: pairwiseDebts(norm, settleByCur[cur] ?? []) }
  }).filter((g) => g.debts.length > 0)
}

export function BalancePanel({ expenses, settlements, members, canSettle, onSettle }) {
  const byId = new Map((members ?? []).map((m) => [m.id, m]))
  const groups = debtsByCurrency((expenses ?? []).filter((e) => e.scope === 'team'), settlements ?? [])
  const name = (id) => memberName(byId.get(id))

  return (
    <section className={styles.panel}>
      <div className={styles.head}><h3 className={styles.h}>Who owes whom</h3><p className={styles.s}>Per currency · tap ✓ to settle</p></div>
      {groups.length === 0 ? (
        <p className={styles.empty}>✓ All settled.</p>
      ) : groups.map((g) => (
        <div key={g.currency} className={styles.cur}>
          <div className={styles.curlbl}>In {g.currency}</div>
          {g.debts.map((d, i) => (
            <div key={i} className={styles.liab}>
              <span className={styles.flow}>{name(d.from)} → {name(d.to)}</span>
              <span className={styles.n}>{formatMoney(d.amount, g.currency)}</span>
              {canSettle(d) && (
                <button type="button" className={styles.chk} aria-label={`Settle ${name(d.from)} to ${name(d.to)}`}
                  onClick={() => onSettle({ ...d, currency: g.currency })}>✓</button>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
```

`src/components/BalancePanel.module.css`:
```css
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
.head { padding: 16px 18px 8px; }
.h { font-family: var(--font-display); font-weight: 700; font-size: 15px; margin: 0; }
.s { font-size: 11.5px; color: var(--ink-muted); margin: 2px 0 0; }
.empty { color: var(--c-green-700, #15803d); font-size: 13px; padding: 4px 18px 16px; }
.cur { padding: 6px 18px 14px; }
.curlbl { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); font-weight: 700; padding: 10px 0 6px; border-bottom: 1px solid var(--c-line); }
.liab { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #f1f6fb; }
.liab:first-of-type { border-top: 0; }
.flow { font-size: 13px; }
.n { margin-left: auto; font-family: var(--font-mono); font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
.chk { width: 26px; height: 26px; flex: none; border-radius: 8px; border: 2px solid var(--c-sky-100); background: #fff; color: #15803d; font-weight: 900; font-size: 14px; display: grid; place-items: center; cursor: pointer; }
.chk:hover { background: #f0fdf4; }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/BalancePanel.test.jsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/components/BalancePanel.jsx src/components/BalancePanel.module.css src/components/BalancePanel.test.jsx
git commit -m "feat: BalancePanel per-currency settle-up (finance 5a)"
```

---

## Task 13: `Finance` page — sub-nav, Team view, currency gate

**Files:** Create `src/pages/Finance.jsx`, `.module.css`, `.test.jsx`.

- [ ] **Step 1: Write the failing test** — `src/pages/Finance.test.jsx`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const settle = vi.fn(), del = vi.fn()
vi.mock('../hooks/useSettleDebt', () => ({ useSettleDebt: () => ({ mutate: settle }) }))
vi.mock('../hooks/useDeleteExpense', () => ({ useDeleteExpense: () => ({ mutate: del }) }))
vi.mock('../hooks/useUpsertExpense', () => ({ useUpsertExpense: () => ({ mutate: vi.fn(), isPending: false }) }))
let ctx, authUser
vi.mock('react-router-dom', () => ({ useOutletContext: () => ctx }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }))
import { Finance } from './Finance'

const baseTrip = {
  id: 't1', departure_currency: 'MYR', destination_currency: 'JPY',
  trip_members: [{ id: 'A', user_id: 'uA', role: 'host', display_name: 'Ana' }, { id: 'B', user_id: 'uB', role: 'editor', display_name: 'Ben' }],
  expenses: [{ id: 'e1', scope: 'team', description: 'Dinner', currency: 'JPY', paid_by: 'A', total_amount: 6000, expense_splits: [{ member_id: 'A', amount: 3000 }, { member_id: 'B', amount: 3000 }] }],
  settlements: [], budget_categories: [],
}
beforeEach(() => { vi.clearAllMocks(); ctx = { trip: baseTrip }; authUser = { id: 'uA' } })

describe('Finance', () => {
  it('shows the Team expense list and the balance panel', () => {
    render(<Finance />)
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByText(/who owes whom/i)).toBeInTheDocument()
  })
  it('host sees + Add expense', () => {
    render(<Finance />)
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument()
  })
  it('gates the page when trip currencies are unset', () => {
    ctx = { trip: { ...baseTrip, departure_currency: null, destination_currency: null } }
    render(<Finance />)
    expect(screen.getByText(/set your trip currencies/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/pages/Finance.test.jsx` → FAIL.

- [ ] **Step 3: Write implementation + CSS**

`src/pages/Finance.jsx`:
```js
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { ExpenseRow } from '../components/ExpenseRow'
import { BalancePanel } from '../components/BalancePanel'
import { ExpenseEditorModal } from '../components/ExpenseEditorModal'
import { useSettleDebt } from '../hooks/useSettleDebt'
import { useDeleteExpense } from '../hooks/useDeleteExpense'
import { memberName } from '../lib/display'
import styles from './Finance.module.css'

const VIEWS = [{ id: 'team', label: '🧾 Team' }, { id: 'budget', label: '📊 Budget' }, { id: 'ind', label: '🧍 Individual' }]

export function Finance() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const me = callerMember(trip, user?.id)
  const isWriter = canWrite(me?.role)
  const [view, setView] = useState('team')
  const [editor, setEditor] = useState(null)
  const settle = useSettleDebt(trip.id)
  const del = useDeleteExpense(trip.id)

  const hasCurrencies = !!trip.departure_currency && !!trip.destination_currency
  const members = trip.trip_members ?? []
  const byId = new Map(members.map((m) => [m.id, m]))
  const teamExpenses = (trip.expenses ?? []).filter((e) => e.scope === 'team')

  if (!hasCurrencies) {
    return (
      <section className={styles.wrap}>
        <div className={styles.gate}>
          <h2 className={styles.gateTitle}>Set your trip currencies</h2>
          <p className={styles.gateText}>Finance needs a home (departure) and destination currency for this trip. {isWriter ? 'Open the trip’s Edit dialog to set them.' : 'Ask the host to set them in the trip settings.'}</p>
        </div>
      </section>
    )
  }

  const canSettle = (d) => isWriter || d.from === me?.id || d.to === me?.id
  function onSettle(d) {
    settle.mutate({ from_member: d.from, to_member: d.to, currency: d.currency, amount: d.amount, createdBy: me?.id ?? null })
  }
  function onRemove(exp) { if (window.confirm('Remove this expense?')) del.mutate(exp.id) }

  return (
    <section className={styles.wrap}>
      <div className={styles.nav} role="tablist">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id}
            className={`${styles.seg} ${view === v.id ? styles.on : ''}`} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      {view === 'team' && (
        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.chead}>
              <h2 className={styles.ctitle}>🧾 Team expenses</h2>
              {isWriter && <button type="button" className={styles.add} onClick={() => setEditor({ expense: null })}>+ Add expense</button>}
            </div>
            {teamExpenses.length === 0 ? (
              <p className={styles.empty}>No expenses yet.</p>
            ) : teamExpenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} paidByName={memberName(byId.get(e.paid_by))}
                splitCount={(e.expense_splits ?? []).length} hasReceipt={!!e.receipt_url}
                canManage={isWriter} onEdit={(exp) => setEditor({ expense: exp })} onRemove={onRemove} />
            ))}
          </section>
          <BalancePanel expenses={teamExpenses} settlements={trip.settlements ?? []} members={members} canSettle={canSettle} onSettle={onSettle} />
        </div>
      )}
      {view === 'budget' && <p className={styles.soon}>📊 Budget arrives in slice 5b.</p>}
      {view === 'ind' && <p className={styles.soon}>🧍 Individual arrives in slice 5c.</p>}

      {editor && (
        <ExpenseEditorModal tripId={trip.id} trip={trip} memberId={me?.id ?? null} expense={editor.expense} onClose={() => setEditor(null)} />
      )}
    </section>
  )
}
```

`src/pages/Finance.module.css`:
```css
.wrap { padding: var(--space-5) 0; }
.nav { display: flex; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 5px; box-shadow: var(--shadow-sm); width: max-content; margin-bottom: var(--space-4); }
.seg { font: inherit; font-size: 13px; font-weight: 600; color: var(--ink-muted); padding: 8px 18px; border-radius: 999px; border: 0; background: transparent; cursor: pointer; }
.seg.on { background: var(--c-mist); color: var(--primary-strong); box-shadow: inset 0 0 0 1.5px var(--c-sky-100); }
.grid { display: grid; grid-template-columns: 1fr 340px; gap: var(--space-5); align-items: start; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
.chead { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--c-line); }
.ctitle { font-family: var(--font-display); font-weight: 700; font-size: 16px; margin: 0; }
.add { margin-left: auto; font: inherit; font-size: 12px; font-weight: 600; color: var(--primary-strong); background: #fff; border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 6px 13px; cursor: pointer; }
.empty { color: var(--ink-muted); font-size: 14px; padding: 16px 20px; }
.soon { color: var(--ink-muted); font-size: 14px; padding: 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
.gate { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: var(--space-6); text-align: center; }
.gateTitle { font-family: var(--font-display); font-size: 18px; margin: 0 0 var(--space-2); }
.gateText { color: var(--ink-muted); font-size: 14px; margin: 0; }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/pages/Finance.test.jsx` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/pages/Finance.jsx src/pages/Finance.module.css src/pages/Finance.test.jsx
git commit -m "feat: Finance page — Team view + currency gate (finance 5a)"
```

---

## Task 14: Route `/finance` → `<Finance/>` + full suite + lint

**Files:** Modify `src/App.jsx` (import + route), `src/App.test.jsx` (only if it pins ComingSoon on /finance).

- [ ] **Step 1: Check App.test.jsx** — Run `npx vitest run src/App.test.jsx`. Read it; if a test asserts ComingSoon on `/finance`, plan to update it in Step 3.

- [ ] **Step 2: Swap import + route** — in `src/App.jsx`, add after the `Packing` import:
```js
import { Finance } from './pages/Finance'
```
and replace the finance route line:
```js
                    <Route path="finance" element={<Finance />} />
```
(Leave `discussion` as `ComingSoon`; keep the `ComingSoon` import.)

- [ ] **Step 3: Run the full suite** — `npx vitest run` → all pass (existing + new finance tests). Fix any App test that assumed ComingSoon on /finance. (If a file cold-flakes to "no tests", re-run once.)

- [ ] **Step 4: Lint** — `npm run lint` → clean. Fix any unused-import/var introduced.

- [ ] **Step 5: Commit**
```bash
git add src/App.jsx src/App.test.jsx
git commit -m "feat: mount Finance page at /finance (finance 5a)"
```

---

## Task 15: Manual verification & wrap-up

- [ ] **Step 1: Smoke-test** — `npm run dev`. Create a new trip picking home + destination currencies. Open Finance → Team: add a team expense (try switching currency via Departure/Destination/Other; edit split amounts so it's off — Save disables; balance it — Save enables). Confirm the expense appears with the right currency; the balance panel shows per-currency debts; tap ✓ to settle and watch the debt clear after refetch. Open an old trip (no currencies) → see the "Set your trip currencies" gate; set them via Edit trip.
- [ ] **Step 2: Re-run the two-account RLS/RPC checks** from Task 1 Step 2 on live accounts.
- [ ] **Step 3: Final full test + lint** — `npx vitest run && npm run lint` → all green.
- [ ] **Step 4: Update the roadmap memory** — note #5 slice 5a done (currencies + team expenses/splits + balances + settle); 5b/5c/5d pending. Follow the memory-writing rules.

---

## Self-review notes (author)

- **Spec coverage (5a scope):** currency prerequisite (trips cols + create/edit pickers + `currencies.js` + gate) → Tasks 1,5,6,13,2; expenses/splits/settlements tables + RLS + `record_expense` RPC → Task 1; pure split/balance libs → Tasks 3,4; embed → Task 7; hooks → Tasks 8,9; Team UI (row, form w/ balance guard, balance panel, page, route) → Tasks 10–14; manual/RLS verify → Tasks 1,15. Budget/Individual/Receipts (5b/5c/5d) intentionally out of this plan (page shows "arrives in 5b/5c" stubs).
- **Type consistency:** `useUpsertExpense` input `{scope,id?,description,currency,total_amount,paid_by,category_id,spent_on,receipt_url,splits:[{member_id,amount}]}` matches the modal's `mutate` payload and the RPC params. `pairwiseDebts(expenses,settlements)` expects `expenses:[{paid_by,total_amount,splits}]`; `BalancePanel` normalizes `expense_splits`→`splits` before calling. `useSettleDebt` payload `{from_member,to_member,currency,amount,createdBy}` matches `Finance.onSettle`. `formatMoney(amount,code)` used consistently.
- **No placeholders:** every code/test step has full code + exact commands. (The `create_trip` RPC extension in Task 5 is described as SQL to add; the exact recreate statement is a Supabase-side change like Task 1.)
```
