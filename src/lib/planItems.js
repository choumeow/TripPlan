import { suggestionType } from './suggestionTypes'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

// Does a plan item's availability include the given date/time? Non-place kinds always pass.
export function availabilityMatches(item, dateStr, timeStr) {
  if (!dateStr) return true
  if (item.kind !== 'place') return true
  if (item.avail_start_date && dateStr < item.avail_start_date) return false
  if (item.avail_end_date && dateStr > item.avail_end_date) return false
  const days = item.avail_days ?? []
  const wd = new Date(dateStr + 'T00:00').getDay()
  if (days.length && !days.includes(wd)) return false
  if (timeStr && item.avail_open && item.avail_close) {
    return timeStr >= hhmm(item.avail_open) && timeStr <= hhmm(item.avail_close)
  }
  return true
}

// Short human label of a place's opening hours; '' for non-place kinds.
export function availabilityLabel(item) {
  if (item.kind !== 'place') return ''
  const days = (item.avail_days ?? []).slice().sort((a, b) => a - b)
  let dayPart = ''
  if (days.length === 7) dayPart = 'Daily'
  else if (days.length) dayPart = days.map((d) => DAY_ABBR[d]).join(', ')
  const time = item.avail_open && item.avail_close ? `${hhmm(item.avail_open)}–${hhmm(item.avail_close)}` : ''
  return [dayPart, time].filter(Boolean).join(' · ')
}

// A fresh editor form for a chosen suggestion type.
export function blankSuggestionForm(typeKey) {
  return {
    id: undefined, typeKey,
    title: '', location: '', link: '', description: '', priceRange: '',
    availDays: [], availOpen: '', availClose: '', availStart: '', availEnd: '',
    checkIn: '', checkOut: '',
    method: 'train', from: '', to: '', reference: '', note: '',
  }
}

// The type chip a stored plan_items row belongs to.
export function planItemTypeKey(row) {
  return row.kind === 'hostel' ? 'stay' : row.category
}

// plan_items row (snake_case) -> editor form.
export function planItemToForm(row) {
  return {
    ...blankSuggestionForm(planItemTypeKey(row)),
    id: row.id,
    title: row.title ?? '',
    location: row.location ?? '',
    link: row.link ?? '',
    description: row.description ?? '',
    priceRange: row.price_range ?? '',
    availDays: row.avail_days ?? [],
    availOpen: hhmm(row.avail_open),
    availClose: hhmm(row.avail_close),
    availStart: row.avail_start_date ?? '',
    availEnd: row.avail_end_date ?? '',
    checkIn: row.check_in_date ?? '',
    checkOut: row.check_out_date ?? '',
  }
}

// editor form -> plan_items row fields (snake_case). Caller adds trip_id/created_by on insert.
export function formToPlanItem(form) {
  const t = suggestionType(form.typeKey)
  const isPlace = t.kind === 'place'
  const trim = (v) => (v.trim() ? v.trim() : null)
  return {
    ...(form.id ? { id: form.id } : {}),
    kind: t.kind,
    category: t.category,
    title: form.title.trim(),
    location: trim(form.location),
    link: trim(form.link),
    description: trim(form.description),
    price_range: trim(form.priceRange),
    avail_days: isPlace ? form.availDays : null,
    avail_open: isPlace ? form.availOpen || null : null,
    avail_close: isPlace ? form.availClose || null : null,
    avail_start_date: isPlace ? form.availStart || null : null,
    avail_end_date: isPlace ? form.availEnd || null : null,
    check_in_date: t.kind === 'hostel' ? form.checkIn || null : null,
    check_out_date: t.kind === 'hostel' ? form.checkOut || null : null,
    status: 'pending',
  }
}
