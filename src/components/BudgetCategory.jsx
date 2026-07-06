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
