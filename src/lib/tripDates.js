// All dates are 'YYYY-MM-DD' strings; compared as UTC day numbers (timezone-safe).
function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function nights(trip) {
  return dayNumber(trip.end_date) - dayNumber(trip.start_date)
}

export function daysToGo(trip, today) {
  return dayNumber(trip.start_date) - dayNumber(today)
}

export function tripStatus(trip, today) {
  const t = dayNumber(today)
  if (dayNumber(trip.end_date) < t) return 'past'
  if (dayNumber(trip.start_date) <= t) return 'current'
  return 'upcoming'
}

export function countdownLabel(trip, today) {
  const status = tripStatus(trip, today)
  if (status === 'past') return 'Completed'
  if (status === 'current') {
    const day = dayNumber(today) - dayNumber(trip.start_date) + 1
    return `In progress · Day ${day}`
  }
  const d = daysToGo(trip, today)
  return d === 1 ? '1 day to go' : `${d} days to go`
}

export function journeyProgress(trip, today, window = 30) {
  if (tripStatus(trip, today) !== 'upcoming') return 1
  const p = (window - daysToGo(trip, today)) / window
  return Math.min(1, Math.max(0, p))
}

export function arrangeTimeline(trips, today) {
  const previous = []
  const notPast = []
  for (const trip of trips) {
    if (tripStatus(trip, today) === 'past') previous.push(trip)
    else notPast.push(trip)
  }
  notPast.sort((a, b) => dayNumber(a.start_date) - dayNumber(b.start_date))
  previous.sort((a, b) => dayNumber(b.start_date) - dayNumber(a.start_date))
  const [hero = null, ...future] = notPast
  return { previous, hero, future }
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export function monthDay(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${MONTHS[Number(m) - 1]} ${d}`
}

// Every calendar day of the trip, inclusive: [{ index: 1, date: 'YYYY-MM-DD' }, ...].
export function tripDays(trip) {
  if (!trip?.start_date || !trip?.end_date) return []
  const start = dayNumber(trip.start_date)
  const end = dayNumber(trip.end_date)
  const days = []
  for (let n = start, i = 1; n <= end; n++, i++) {
    const d = new Date(n * 86_400_000)
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    days.push({ index: i, date })
  }
  return days
}
