// Single source of truth: each place category's label + badge color together.
export const PLACE_CATEGORIES = {
  visit:    { label: 'Visit',    color: '#0EA5E9' },
  meal:     { label: 'Meal',     color: '#F59E0B' },
  shopping: { label: 'Shopping', color: '#EC4899' },
  museum:   { label: 'Museum',   color: '#A855F7' },
  other:    { label: 'Other',    color: '#64748B' },
}

export const PLACE_CATEGORY_KEYS = Object.keys(PLACE_CATEGORIES)

export function categoryMeta(key) {
  return PLACE_CATEGORIES[key] ?? PLACE_CATEGORIES.other
}
