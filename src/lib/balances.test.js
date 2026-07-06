import { describe, it, expect } from 'vitest'
import { netByMember, simplify, pairwiseDebts, myDebts } from './balances'

// A paid 12000, split equally among A,B,C,D (3000 each) → B,C,D each owe A 3000.
const expenses = [{
  id: 'e1', paid_by: 'A', total_amount: 12000,
  splits: [{ member_id: 'A', amount: 3000 }, { member_id: 'B', amount: 3000 }, { member_id: 'C', amount: 3000 }, { member_id: 'D', amount: 3000 }],
}]

describe('netByMember', () => {
  it('nets paid minus owed per member', () => {
    const net = netByMember(expenses, [])
    expect(net.get('A')).toBe(9000)
    expect(net.get('B')).toBe(-3000)
  })
  it('applies settlements toward zero', () => {
    const net = netByMember(expenses, [{ from_member: 'B', to_member: 'A', amount: 3000 }])
    expect(net.get('B')).toBe(0)
    expect(net.get('A')).toBe(6000)
  })
})
describe('simplify / pairwiseDebts', () => {
  it('produces minimal debtor→creditor transactions', () => {
    const debts = pairwiseDebts(expenses, [])
    expect(debts).toHaveLength(3)
    for (const d of debts) { expect(d.to).toBe('A'); expect(d.amount).toBe(3000) }
  })
  it('drops a debt fully covered by a settlement', () => {
    const debts = pairwiseDebts(expenses, [{ from_member: 'B', to_member: 'A', amount: 3000 }])
    expect(debts.find((d) => d.from === 'B')).toBeUndefined()
    expect(debts).toHaveLength(2)
  })
})
describe('myDebts', () => {
  it('filters to debts the member is party to', () => {
    const debts = [{ from: 'B', to: 'A', amount: 3000 }, { from: 'C', to: 'A', amount: 3000 }]
    expect(myDebts(debts, 'B')).toEqual([{ from: 'B', to: 'A', amount: 3000 }])
  })
})
