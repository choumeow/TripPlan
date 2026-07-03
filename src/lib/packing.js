import { PACKING_CATEGORY_ORDER } from './packingCategories'

// Split all visible packing rows into the lists a given user works with.
// RLS already strips other real members' personal rows; we filter defensively too.
export function partition(items, members, authUserId) {
  const list = items ?? []
  const mems = members ?? []
  const myMemberId = mems.find((m) => m.user_id === authUserId)?.id ?? null
  const shared = list.filter((i) => i.scope === 'shared')
  const mine = list.filter((i) => i.scope === 'personal' && i.owner_member_id === myMemberId)
  const ghostLists = mems
    .filter((m) => m.user_id == null)
    .map((m) => ({
      member: m,
      items: list.filter((i) => i.scope === 'personal' && i.owner_member_id === m.id),
    }))
  return { shared, mine, myMemberId, ghostLists }
}

// Group items under category keys in fixed order; drop empty categories.
export function groupByCategory(items) {
  const list = items ?? []
  return PACKING_CATEGORY_ORDER
    .map((key) => ({ key, items: list.filter((i) => i.category === key) }))
    .filter((g) => g.items.length > 0)
}

// {packed, total} across the given items.
export function progress(items) {
  const list = items ?? []
  return { packed: list.filter((i) => i.packed).length, total: list.length }
}
