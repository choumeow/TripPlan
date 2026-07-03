import { describe, it, expect } from 'vitest'
import { DAY_START, DAY_END, SLOT, timeToMin, minToTime, slotId, parseSlotId, calendarLayout } from './calendar'

describe('time helpers', () => {
  it('has a full-day 30-min grid', () => {
    expect(DAY_START).toBe(0)
    expect(DAY_END).toBe(23 * 60 + 30)
    expect(SLOT).toBe(30)
  })
  it('converts time <-> minutes (tolerating HH:MM:SS)', () => {
    expect(timeToMin('09:30')).toBe(570)
    expect(timeToMin('09:30:00')).toBe(570)
    expect(timeToMin(null)).toBeNull()
    expect(minToTime(570)).toBe('09:30')
    expect(minToTime(0)).toBe('00:00')
  })
  it('builds and parses slot ids', () => {
    expect(slotId('2026-07-04', 570)).toBe('cal:2026-07-04:0930')
    expect(parseSlotId('cal:2026-07-04:0930')).toEqual({ date: '2026-07-04', min: 570 })
    expect(parseSlotId('cal:2026-07-04:untimed')).toEqual({ date: '2026-07-04', min: null })
  })
})

describe('calendarLayout (overlap columns)', () => {
  it('gives non-overlapping items a single column', () => {
    const laid = calendarLayout([
      { id: 'a', startMin: 540, durMin: 60 }, // 09:00–10:00
      { id: 'b', startMin: 660, durMin: 60 }, // 11:00–12:00
    ])
    expect(laid.every((x) => x.colCount === 1 && x.col === 0)).toBe(true)
  })
  it('puts overlapping items in side-by-side columns', () => {
    const laid = calendarLayout([
      { id: 'a', startMin: 540, durMin: 60 }, // 09:00–10:00
      { id: 'b', startMin: 570, durMin: 60 }, // 09:30–10:30 (overlaps a)
    ])
    const a = laid.find((x) => x.id === 'a'); const b = laid.find((x) => x.id === 'b')
    expect(a.colCount).toBe(2); expect(b.colCount).toBe(2)
    expect(new Set([a.col, b.col])).toEqual(new Set([0, 1]))
  })
  it('treats touching-but-not-overlapping as one column', () => {
    const laid = calendarLayout([
      { id: 'a', startMin: 540, durMin: 60 }, // 09:00–10:00
      { id: 'b', startMin: 600, durMin: 60 }, // 10:00–11:00 (touches, no overlap)
    ])
    expect(laid.every((x) => x.colCount === 1)).toBe(true)
  })
})
