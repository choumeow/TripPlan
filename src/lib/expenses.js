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
