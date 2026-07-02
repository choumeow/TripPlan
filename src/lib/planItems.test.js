import { describe, it, expect } from 'vitest'
import {
  availabilityMatches, availabilityLabel, blankSuggestionForm,
  planItemToForm, formToPlanItem, planItemTypeKey,
} from './planItems'

const place = {
  kind: 'place', category: 'museum', title: 'Museum',
  avail_days: [0, 2, 3, 4, 5, 6], avail_open: '09:30:00', avail_close: '17:00:00',
  avail_start_date: null, avail_end_date: null,
}

describe('availabilityMatches', () => {
  it('passes when no date filter is set', () => {
    expect(availabilityMatches(place, '', '')).toBe(true)
  })
  it('fails on a closed weekday (Monday) and passes on an open one (Tuesday)', () => {
    expect(availabilityMatches(place, '2026-07-06', '')).toBe(false) // Mon
    expect(availabilityMatches(place, '2026-07-07', '')).toBe(true)  // Tue
  })
  it('respects open/close time when a time is given', () => {
    expect(availabilityMatches(place, '2026-07-07', '10:00')).toBe(true)
    expect(availabilityMatches(place, '2026-07-07', '18:00')).toBe(false)
  })
  it('respects an optional date window', () => {
    const evt = { ...place, avail_days: [0,1,2,3,4,5,6], avail_start_date: '2026-07-08', avail_end_date: '2026-07-09' }
    expect(availabilityMatches(evt, '2026-07-07', '')).toBe(false)
    expect(availabilityMatches(evt, '2026-07-08', '')).toBe(true)
  })
  it('non-place kinds always pass', () => {
    expect(availabilityMatches({ kind: 'hostel' }, '2026-07-06', '10:00')).toBe(true)
  })
})

describe('availabilityLabel', () => {
  it('summarises days + hours; empty for non-place', () => {
    expect(availabilityLabel({ kind:'place', avail_days:[0,1,2,3,4,5,6], avail_open:'06:00:00', avail_close:'17:00:00' }))
      .toBe('Daily · 06:00–17:00')
    expect(availabilityLabel({ kind:'place', avail_days:[0], avail_open:'09:00:00', avail_close:'16:00:00' }))
      .toBe('Sun · 09:00–16:00')
    expect(availabilityLabel({ kind:'hostel' })).toBe('')
  })
})

describe('form <-> row mappers', () => {
  it('blank form carries the type key and empty fields', () => {
    const f = blankSuggestionForm('meal')
    expect(f.typeKey).toBe('meal')
    expect(f.title).toBe('')
    expect(f.availDays).toEqual([])
  })
  it('formToPlanItem maps a place form to a snake_case row', () => {
    const f = { ...blankSuggestionForm('museum'), title: 'TNM', location: 'Ueno',
      availDays: [2,3], availOpen: '09:30', availClose: '17:00' }
    expect(formToPlanItem(f)).toMatchObject({
      kind: 'place', category: 'museum', title: 'TNM', location: 'Ueno',
      avail_days: [2,3], avail_open: '09:30', avail_close: '17:00',
      check_in_date: null, status: 'pending',
    })
  })
  it('formToPlanItem maps a stay form with check-in/out and null availability', () => {
    const f = { ...blankSuggestionForm('stay'), title: 'Sakura', location: 'Asakusa', checkIn: '2026-07-03', checkOut: '2026-07-10' }
    expect(formToPlanItem(f)).toMatchObject({
      kind: 'hostel', category: null, check_in_date: '2026-07-03', check_out_date: '2026-07-10', avail_days: null,
    })
  })
  it('planItemToForm round-trips a row back into a form', () => {
    const row = { id: 'p1', kind:'place', category:'meal', title:'Ichiran', location:'Shibuya',
      link:null, description:null, price_range:'¥', avail_days:[0], avail_open:'11:00:00', avail_close:'23:00:00',
      avail_start_date:null, avail_end_date:null, check_in_date:null, check_out_date:null }
    const f = planItemToForm(row)
    expect(f).toMatchObject({ id:'p1', typeKey:'meal', title:'Ichiran', availDays:[0], availOpen:'11:00', availClose:'23:00' })
  })
  it('planItemTypeKey derives the type chip from a row', () => {
    expect(planItemTypeKey({ kind:'hostel' })).toBe('stay')
    expect(planItemTypeKey({ kind:'place', category:'visit' })).toBe('visit')
  })
})
