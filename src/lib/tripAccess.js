export function callerMember(trip, userId) {
  if (!trip || !userId) return null
  return (trip.trip_members ?? []).find((m) => m.user_id === userId) ?? null
}

export function canWrite(role) {
  return role === 'host' || role === 'editor'
}
