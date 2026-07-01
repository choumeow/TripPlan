import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_METHODS,
  METHOD_KEYS,
  methodMeta,
  blankLeg,
  rowToForm,
} from './transport'

describe('transport methods', () => {
  it('exposes a config for every method with labels and an icon', () => {
    for (const key of METHOD_KEYS) {
      const m = TRANSPORT_METHODS[key]
      expect(m.label).toBeTruthy()
      expect(m.icon).toBeTruthy()
      expect(m.from).toBeTruthy()
      expect(m.to).toBeTruthy()
    }
  })

  it('car has no reference field, flight does', () => {
    expect(TRANSPORT_METHODS.car.ref).toBeNull()
    expect(TRANSPORT_METHODS.flight.ref).toBe('Flight no.')
  })

  it('methodMeta falls back to "other" for an unknown method', () => {
    expect(methodMeta('spaceship')).toBe(TRANSPORT_METHODS.other)
    expect(methodMeta('bus')).toBe(TRANSPORT_METHODS.bus)
  })
})

describe('leg <-> form mapping', () => {
  it('blankLeg seeds direction + default date, flight by default', () => {
    expect(blankLeg('outbound', '2026-07-12')).toEqual({
      direction: 'outbound', method: 'flight', departDate: '2026-07-12',
      departTime: '', from: '', to: '', reference: '',
    })
  })

  it('rowToForm maps snake_case DB columns to the form shape', () => {
    const row = {
      id: 'l1', direction: 'return', method: 'bus',
      depart_date: '2026-07-19', depart_time: '18:30',
      from_text: 'Shinjuku', to_text: 'Kyoto', reference: 'Willer',
    }
    expect(rowToForm(row)).toEqual({
      id: 'l1', direction: 'return', method: 'bus',
      departDate: '2026-07-19', departTime: '18:30',
      from: 'Shinjuku', to: 'Kyoto', reference: 'Willer',
    })
  })

  it('rowToForm tolerates null optional columns', () => {
    const row = { id: 'l2', direction: 'outbound', method: 'car',
      depart_date: null, depart_time: null, from_text: 'A', to_text: 'B', reference: null }
    expect(rowToForm(row)).toMatchObject({ departDate: '', departTime: '', reference: '' })
  })
})
