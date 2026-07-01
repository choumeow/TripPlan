// Shared display helpers (kept out of components so they aren't duplicated).
export function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}
