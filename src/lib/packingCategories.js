// Single source of truth: each packing category's label + glyph + color together.
export const PACKING_CATEGORIES = {
  documents:   { label: 'Documents',   glyph: '📄', color: '#0EA5E9' },
  clothing:    { label: 'Clothing',    glyph: '👕', color: '#22C55E' },
  toiletries:  { label: 'Toiletries',  glyph: '🧴', color: '#EC4899' },
  electronics: { label: 'Electronics', glyph: '🔌', color: '#A855F7' },
  gear:        { label: 'Gear',        glyph: '🎒', color: '#F59E0B' },
  other:       { label: 'Other',       glyph: '📦', color: '#64748B' },
}

export const PACKING_CATEGORY_ORDER = ['documents', 'clothing', 'toiletries', 'electronics', 'gear', 'other']

export function packingCategoryMeta(key) {
  return PACKING_CATEGORIES[key] ?? PACKING_CATEGORIES.other
}
