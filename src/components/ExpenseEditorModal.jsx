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
