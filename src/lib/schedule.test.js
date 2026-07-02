import { describe, it, expect } from 'vitest'
import { dndId, parseDndId, partitionSchedule, computeDrop } from './schedule'

const trip = {
  plan_items: [
    { id: 'a', kind: 'place', category: 'visit', title: 'A', scheduled_date: null, sort_order: 1 },
    { id: 'b', kind: 'place', category: 'meal', title: 'B', scheduled_date: '2026-07-03', start_time: '09:00:00', sort_order: 0 },
    { id: 'c', kind: 'hostel', title: 'C', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
  ],
  transport: [
    { id: 't', category: 'local', method: 'subway', from_text: 'X', to_text: 'Y', depart_date: null, sort_order: 0 },
    { id: 'j', category: 'journey', method: 'flight', from_text: 'KUL', to_text: 'HND', depart_date: '2026-07-03' },
  ],
}

describe('dnd id helpers', () => {
  it('round-trips source + id', () => {
    expect(dndId('plan', 'a')).toBe('plan:a')
    expect(dndId('transport', 't')).toBe('tr:t')
    expect(parseDndId('plan:a')).toEqual({ source: 'plan', id: 'a' })
    expect(parseDndId('tr:t')).toEqual({ source: 'transport', id: 't' })
  })
})

describe('partitionSchedule', () => {
  it('splits pending vs by-day and excludes journey transport', () => {
    const { pending, byDay } = partitionSchedule(trip)
    expect(pending.map((i) => i.dndId).sort()).toEqual(['plan:a', 'tr:t'])
    // day items ordered by time then sort_order: B (09:00) before C (no time)
    expect(byDay['2026-07-03'].map((i) => i.dndId)).toEqual(['plan:b', 'plan:c'])
    expect(byDay['2026-07-03'].some((i) => i.dndId === 'tr:j')).toBe(false)
  })
})

describe('computeDrop', () => {
  it('schedules a pending item onto a day (append) and sets its date', () => {
    const drop = computeDrop('plan:a', 'day:2026-07-04', trip)
    expect(drop.updates).toContainEqual({ source: 'plan', id: 'a', patch: { sortOrder: 0, scheduledDate: '2026-07-04' } })
  })
  it('unschedules when dropped on the pending container', () => {
    const drop = computeDrop('plan:b', 'pending', trip)
    const active = drop.updates.find((u) => u.id === 'b')
    expect(active.patch.scheduledDate).toBeNull()
  })
  it('reorders within a day when dropped over a sibling item', () => {
    const drop = computeDrop('plan:c', 'plan:b', trip) // move C above B
    expect(drop.updates.find((u) => u.id === 'c').patch.sortOrder).toBe(0)
    expect(drop.updates.find((u) => u.id === 'b').patch.sortOrder).toBe(1)
  })
  it('reorders DOWNWARD onto an adjacent sibling (untimed items)', () => {
    const dayTrip = {
      plan_items: [
        { id: 'x', kind: 'place', category: 'visit', title: 'X', scheduled_date: '2026-07-03', start_time: null, sort_order: 0 },
        { id: 'y', kind: 'place', category: 'visit', title: 'Y', scheduled_date: '2026-07-03', start_time: null, sort_order: 1 },
        { id: 'z', kind: 'place', category: 'visit', title: 'Z', scheduled_date: '2026-07-03', start_time: null, sort_order: 2 },
      ],
      transport: [],
    }
    const drop = computeDrop('plan:x', 'plan:y', dayTrip) // move X down onto Y
    expect(drop).not.toBeNull()
    expect(drop.updates.find((u) => u.id === 'x').patch.sortOrder).toBe(1)
    expect(drop.updates.find((u) => u.id === 'y').patch.sortOrder).toBe(0)
  })
  it('returns null for a no-op drop (same spot)', () => {
    expect(computeDrop('plan:b', 'plan:b', trip)).toBeNull()
    expect(computeDrop('plan:b', undefined, trip)).toBeNull()
  })
})
