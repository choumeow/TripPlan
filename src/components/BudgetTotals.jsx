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
