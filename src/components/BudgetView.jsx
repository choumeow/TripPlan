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
