import { describe, it, expect } from 'vitest'
import {
  nights,
  daysToGo,
  tripStatus,
  countdownLabel,
  journeyProgress,
  arrangeTimeline,
} from './tripDates'

const trip = (start_date, end_date, extra = {}) => ({ start_date, end_date, ...extra })

describe('tripDates', () => {
  it('nights = whole days between start and end', () => {
    expect(nights(trip('2026-07-12', '2026-07-19'))).toBe(7)
  })

  it('daysToGo counts days from today to start', () => {
    expect(daysToGo(trip('2026-07-12', '2026-07-19'), '2026-06-30')).toBe(12)
    expect(daysToGo(trip('2026-07-12', '2026-07-19'), '2026-07-12')).toBe(0)
  })

  it('tripStatus classifies at boundaries', () => {
    const t = trip('2026-07-12', '2026-07-19')
    expect(tripStatus(t, '2026-07-11')).toBe('upcoming')
    expect(tripStatus(t, '2026-07-12')).toBe('current')
    expect(tripStatus(t, '2026-07-19')).toBe('current')
    expect(tripStatus(t, '2026-07-20')).toBe('past')
  })

  it('countdownLabel reflects status', () => {
    const t = trip('2026-07-12', '2026-07-19')
    expect(countdownLabel(t, '2026-06-30')).toBe('12 days to go')
    expect(countdownLabel(trip('2026-07-12', '2026-07-19'), '2026-07-11')).toBe('1 day to go')
    expect(countdownLabel(t, '2026-07-13')).toBe('In progress · Day 2')
    expect(countdownLabel(t, '2026-07-20')).toBe('Completed')
  })

  it('journeyProgress clamps 0..1 over a 30-day window', () => {
    const t = trip('2026-07-12', '2026-07-19')
    expect(journeyProgress(t, '2026-06-01')).toBe(0)
    expect(journeyProgress(t, '2026-06-27')).toBeCloseTo(0.5, 5)
    expect(journeyProgress(t, '2026-07-12')).toBe(1)
    expect(journeyProgress(t, '2026-07-15')).toBe(1)
  })

  it('arrangeTimeline picks hero and splits previous/future', () => {
    const past = trip('2026-02-03', '2026-02-10', { id: 'past' })
    const soon = trip('2026-07-12', '2026-07-19', { id: 'soon' })
    const later = trip('2026-10-02', '2026-10-08', { id: 'later' })
    const r = arrangeTimeline([later, past, soon], '2026-06-30')
    expect(r.previous.map((t) => t.id)).toEqual(['past'])
    expect(r.hero.id).toBe('soon')
    expect(r.future.map((t) => t.id)).toEqual(['later'])
  })

  it('arrangeTimeline returns null hero when all trips are past', () => {
    const r = arrangeTimeline([trip('2026-01-01', '2026-01-05', { id: 'a' })], '2026-06-30')
    expect(r.hero).toBeNull()
    expect(r.previous.map((t) => t.id)).toEqual(['a'])
  })
})
