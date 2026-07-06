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
