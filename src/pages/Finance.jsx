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
