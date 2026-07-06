import { describe, it, expect } from 'vitest'
import { equalSplit, splitsBalance, groupByCurrency, myShare } from './expenses'

describe('equalSplit', () => {
  it('splits evenly and pushes the rounding remainder to the first members', () => {
    const s = equalSplit(10, ['a', 'b', 'c'])
    expect(s.map((x) => x.amount)).toEqual([3.34, 3.33, 3.33])
    expect(s.reduce((t, x) => t + x.amount, 0)).toBeCloseTo(10, 5)
  })
  it('returns [] for no members', () => { expect(equalSplit(10, [])).toEqual([]) })
})
describe('splitsBalance', () => {
  it('is true only when splits sum to the total (within a cent)', () => {
    expect(splitsBalance(12000, [{ amount: 3000 }, { amount: 9000 }])).toBe(true)
    expect(splitsBalance(12000, [{ amount: 3000 }, { amount: 8000 }])).toBe(false)
  })
})
describe('groupByCurrency', () => {
  it('buckets expenses by currency code', () => {
    const g = groupByCurrency([{ id: 1, currency: 'JPY' }, { id: 2, currency: 'MYR' }, { id: 3, currency: 'JPY' }])
    expect(g.JPY.map((e) => e.id)).toEqual([1, 3])
    expect(g.MYR.map((e) => e.id)).toEqual([2])
  })
})
describe('myShare', () => {
  it('sums a member\'s split amounts', () => {
    expect(myShare([{ member_id: 'a', amount: 3000 }, { member_id: 'b', amount: 9000 }], 'a')).toBe(3000)
    expect(myShare([], 'a')).toBe(0)
  })
})
