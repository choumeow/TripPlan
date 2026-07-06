import { formatMoney } from '../lib/currencies'
import { groupByCurrency } from '../lib/expenses'
import { pairwiseDebts } from '../lib/balances'
import { memberName } from '../lib/display'
import styles from './BalancePanel.module.css'

// expenses carry `expense_splits`; balances math needs `splits`. Normalize per currency.
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
