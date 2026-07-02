import { describe, it, expect } from 'vitest'
import { SUGGESTION_TYPES, suggestionType } from './suggestionTypes'

describe('suggestionTypes', () => {
  it('maps every place category to plan_items/place and includes stay + transport', () => {
    const visit = suggestionType('visit')
    expect(visit).toMatchObject({ target: 'plan_items', kind: 'place', category: 'visit' })
    expect(suggestionType('stay')).toMatchObject({ target: 'plan_items', kind: 'hostel', category: null })
    expect(suggestionType('transport')).toMatchObject({ target: 'transport' })
  })
  it('every type has a key, label and color; unknown returns null', () => {
    for (const t of SUGGESTION_TYPES) {
      expect(t.key).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
    expect(suggestionType('nope')).toBeNull()
  })
})
