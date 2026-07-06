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
