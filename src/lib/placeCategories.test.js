import { describe, it, expect } from 'vitest'
import { PLACE_CATEGORIES, PLACE_CATEGORY_KEYS, categoryMeta } from './placeCategories'

describe('placeCategories', () => {
  it('every category has a label and a color', () => {
    for (const meta of Object.values(PLACE_CATEGORIES)) {
      expect(typeof meta.label).toBe('string')
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
  it('exposes the keys and falls back to "other" for unknown', () => {
    expect(PLACE_CATEGORY_KEYS).toContain('visit')
    expect(categoryMeta('nope')).toBe(PLACE_CATEGORIES.other)
    expect(categoryMeta('meal').label).toBe('Meal')
  })
})
