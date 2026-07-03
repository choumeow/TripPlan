import { describe, it, expect } from 'vitest'
import { partition, groupByCategory, progress } from './packing'

const members = [
  { id: 'mA', user_id: 'uA', display_name: 'Ana' },
  { id: 'mB', user_id: 'uB', display_name: 'Ben' },
  { id: 'gG', user_id: null, display_name: 'Grandma' },
]
const items = [
  { id: 's1', scope: 'shared', owner_member_id: null, category: 'gear', packed: true },
  { id: 'a1', scope: 'personal', owner_member_id: 'mA', category: 'clothing', packed: false },
  { id: 'b1', scope: 'personal', owner_member_id: 'mB', category: 'clothing', packed: false },
  { id: 'g1', scope: 'personal', owner_member_id: 'gG', category: 'toiletries', packed: true },
]

describe('partition', () => {
  it('splits shared, my own personal, and one list per ghost', () => {
    const p = partition(items, members, 'uA')
    expect(p.myMemberId).toBe('mA')
    expect(p.shared.map((i) => i.id)).toEqual(['s1'])
    expect(p.mine.map((i) => i.id)).toEqual(['a1'])
    expect(p.ghostLists).toHaveLength(1)
    expect(p.ghostLists[0].member.id).toBe('gG')
    expect(p.ghostLists[0].items.map((i) => i.id)).toEqual(['g1'])
  })
  it('never surfaces another real member\'s personal items', () => {
    const p = partition(items, members, 'uA')
    const allShown = [...p.shared, ...p.mine, ...p.ghostLists.flatMap((g) => g.items)].map((i) => i.id)
    expect(allShown).not.toContain('b1')
  })
  it('lists a ghost with no items as an empty list', () => {
    const p = partition([], members, 'uA')
    expect(p.ghostLists).toHaveLength(1)
    expect(p.ghostLists[0].items).toEqual([])
  })
  it('tolerates null items/members', () => {
    const p = partition(null, null, 'uA')
    expect(p).toEqual({ shared: [], mine: [], myMemberId: null, ghostLists: [] })
  })
})

describe('groupByCategory', () => {
  it('groups in fixed order and drops empty categories', () => {
    const g = groupByCategory([
      { id: '1', category: 'gear' },
      { id: '2', category: 'documents' },
      { id: '3', category: 'gear' },
    ])
    expect(g.map((x) => x.key)).toEqual(['documents', 'gear'])
    expect(g[1].items.map((i) => i.id)).toEqual(['1', '3'])
  })
})

describe('progress', () => {
  it('counts packed and total', () => {
    expect(progress(items)).toEqual({ packed: 2, total: 4 })
    expect(progress([])).toEqual({ packed: 0, total: 0 })
    expect(progress(null)).toEqual({ packed: 0, total: 0 })
  })
})
