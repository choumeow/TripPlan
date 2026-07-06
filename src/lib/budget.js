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
