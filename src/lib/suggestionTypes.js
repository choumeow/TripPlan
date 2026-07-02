import { PLACE_CATEGORIES, PLACE_CATEGORY_KEYS } from './placeCategories'

// The add-form "type" selector. Each type maps a chosen chip to a save target + identity.
export const SUGGESTION_TYPES = [
  ...PLACE_CATEGORY_KEYS.map((key) => ({
    key,
    label: PLACE_CATEGORIES[key].label,
    color: PLACE_CATEGORIES[key].color,
    target: 'plan_items',
    kind: 'place',
    category: key,
  })),
  { key: 'stay', label: 'Stay', color: '#22C55E', target: 'plan_items', kind: 'hostel', category: null },
  { key: 'transport', label: 'Transport', color: '#14B8A6', target: 'transport', kind: null, category: null },
]

export function suggestionType(key) {
  return SUGGESTION_TYPES.find((t) => t.key === key) ?? null
}
