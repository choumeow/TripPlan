// Pure calendar-grid math. No @dnd-kit, no React.
export const DAY_START = 0            // minutes from midnight
export const DAY_END = 23 * 60 + 30   // 23:30
export const SLOT = 30                // minutes per slot
export const SLOT_PX = 30             // px per slot (used by the components)

export function timeToMin(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}
export function minToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function slotId(date, min) {
  return `cal:${date}:${minToTime(min).replace(':', '')}`
}
export function parseSlotId(id) {
  const rest = id.slice(4)                 // strip 'cal:'
  const i = rest.lastIndexOf(':')          // date has no other ':'
  const date = rest.slice(0, i)
  const tail = rest.slice(i + 1)
  if (tail === 'untimed') return { date, min: null }
  return { date, min: Number(tail.slice(0, 2)) * 60 + Number(tail.slice(2)) }
}

// [{ id, startMin, durMin }] -> same + { col, colCount }, packing overlaps side by side.
export function calendarLayout(items) {
  const sorted = items.slice().sort((a, b) => a.startMin - b.startMin || a.durMin - b.durMin)
  const colEnds = []                       // running end-min per column
  const placed = sorted.map((it) => {
    const end = it.startMin + it.durMin
    let col = colEnds.findIndex((e) => e <= it.startMin)
    if (col === -1) { col = colEnds.length; colEnds.push(end) } else { colEnds[col] = end }
    return { ...it, col }
  })
  // Group chain-overlapping items into clusters; colCount = columns used in the cluster.
  const out = []
  let cluster = []
  let clusterEnd = -Infinity
  const flush = () => {
    if (!cluster.length) return
    const colCount = Math.max(...cluster.map((c) => c.col)) + 1
    for (const c of cluster) out.push({ ...c, colCount })
    cluster = []
  }
  for (const it of placed) {
    if (it.startMin >= clusterEnd) { flush(); clusterEnd = -Infinity }
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.startMin + it.durMin)
  }
  flush()
  return out
}
