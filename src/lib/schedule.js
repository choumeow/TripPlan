// A trip's plan_items + local transport, wrapped into a common scheduled-item shape and
// partitioned into the pending backlog vs each day. All pure — no @dnd-kit here.

export function dndId(source, id) {
  return `${source === 'transport' ? 'tr' : 'plan'}:${id}`
}
export function parseDndId(value) {
  const idx = value.indexOf(':')
  const prefix = value.slice(0, idx)
  return { source: prefix === 'tr' ? 'transport' : 'plan', id: value.slice(idx + 1) }
}

function planWrap(row) {
  return { source: 'plan', id: row.id, dndId: dndId('plan', row.id),
    day: row.scheduled_date ?? null, time: row.start_time ?? null, order: row.sort_order ?? 0, raw: row }
}
function transportWrap(row) {
  return { source: 'transport', id: row.id, dndId: dndId('transport', row.id),
    day: row.depart_date ?? null, time: row.depart_time ?? null, order: row.sort_order ?? 0, raw: row }
}

export function scheduleItems(trip) {
  const plans = (trip.plan_items ?? []).map(planWrap)
  const locals = (trip.transport ?? []).filter((t) => t.category === 'local').map(transportWrap)
  return [...plans, ...locals]
}

// A missing time sorts LAST. Raw code-point compare (not localeCompare, whose punctuation
// rules would place a sentinel before digits) keeps timed items ahead of untimed ones.
const timeKey = (t) => t ?? '￿'
const byTimeThenOrder = (a, b) => {
  const ta = timeKey(a.time), tb = timeKey(b.time)
  return ta < tb ? -1 : ta > tb ? 1 : a.order - b.order
}
const byOrder = (a, b) => a.order - b.order

export function partitionSchedule(trip) {
  const items = scheduleItems(trip)
  const pending = items.filter((i) => !i.day).slice().sort(byOrder)
  const byDay = {}
  for (const i of items.filter((i) => i.day)) (byDay[i.day] ??= []).push(i)
  for (const d of Object.keys(byDay)) byDay[d].sort(byTimeThenOrder)
  return { pending, byDay }
}

const dayOf = (containerId) => containerId.slice(4) // 'day:2026-07-03' -> '2026-07-03'

// activeId/overId are dnd ids (item = 'plan:x'/'tr:x'; container = 'pending'/'day:YYYY-MM-DD').
// Returns { updates: [{source,id,patch}] } to persist, or null for a no-op.
export function computeDrop(activeId, overId, trip) {
  if (!overId || activeId === overId) return null
  const { pending, byDay } = partitionSchedule(trip)
  const containers = [['pending', pending], ...Object.entries(byDay).map(([d, arr]) => [`day:${d}`, arr])]
  const listOf = (cid) => (cid === 'pending' ? pending : byDay[dayOf(cid)] ?? [])

  const active = containers.flatMap(([, arr]) => arr).find((i) => i.dndId === activeId)
  if (!active) return null
  const fromEntry = containers.find(([, arr]) => arr.some((i) => i.dndId === activeId))
  const from = fromEntry[0]

  let to, index
  if (overId === 'pending' || overId.startsWith('day:')) {
    to = overId
    index = listOf(to).filter((i) => i.dndId !== activeId).length // append to end
  } else {
    const overEntry = containers.find(([, arr]) => arr.some((i) => i.dndId === overId))
    if (!overEntry) return null
    to = overEntry[0]
    index = listOf(to).filter((i) => i.dndId !== activeId).findIndex((i) => i.dndId === overId)
  }

  const target = listOf(to).filter((i) => i.dndId !== activeId)
  const at = Math.max(0, Math.min(index, target.length))
  target.splice(at, 0, active)

  // no-op: same container, same position
  if (from === to && listOf(from).findIndex((i) => i.dndId === activeId) === at) return null

  const scheduledDate = to === 'pending' ? null : dayOf(to)
  const updates = target
    .map((i, idx) => ({ i, idx }))
    .filter(({ i, idx }) => idx !== i.order || i.dndId === activeId)
    .map(({ i, idx }) => ({
      source: i.source, id: i.id,
      patch: { sortOrder: idx, ...(i.dndId === activeId ? { scheduledDate } : {}) },
    }))
  return { activeId, from, to, updates }
}
