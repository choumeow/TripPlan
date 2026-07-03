// Shared display helpers (kept out of components so they aren't duplicated).
export function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

// Best display name for a trip member (real or ghost).
export function memberName(m) {
  return m?.profiles?.display_name || m?.display_name || 'Guest'
}
