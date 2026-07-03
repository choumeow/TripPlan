import { describe, it, expect } from 'vitest'
import { PACKING_CATEGORIES, PACKING_CATEGORY_ORDER, packingCategoryMeta } from './packingCategories'

describe('packingCategories', () => {
  it('every category has a label, glyph and color', () => {
    for (const key of PACKING_CATEGORY_ORDER) {
      const c = PACKING_CATEGORIES[key]
      expect(c).toBeTruthy()
      expect(c.label).toBeTruthy()
      expect(c.glyph).toBeTruthy()
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
  it('order covers exactly the config keys', () => {
    expect([...PACKING_CATEGORY_ORDER].sort()).toEqual(Object.keys(PACKING_CATEGORIES).sort())
  })
  it('packingCategoryMeta falls back to "other" for an unknown key', () => {
    expect(packingCategoryMeta('nope')).toBe(PACKING_CATEGORIES.other)
    expect(packingCategoryMeta('gear')).toBe(PACKING_CATEGORIES.gear)
  })
})
