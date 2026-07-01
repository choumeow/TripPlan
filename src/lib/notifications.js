// Single source of truth for how each notification type is presented.
export const NOTIFICATION_TYPES = {
  invite_received: {
    icon: '✉',
    actionable: true,
    text: (p) => `${p.actor_name} invited you to ${p.trip_name} as ${p.role}`,
  },
  invite_accepted: {
    icon: '✓',
    actionable: false,
    text: (p) => `${p.actor_name} accepted your invite to ${p.trip_name}`,
  },
  invite_declined: {
    icon: '✕',
    actionable: false,
    text: (p) => `${p.actor_name} declined your invite to ${p.trip_name}`,
  },
}

export function notificationMeta(type) {
  return NOTIFICATION_TYPES[type] ?? null
}

export function notificationText(notification) {
  const meta = NOTIFICATION_TYPES[notification.type]
  return meta ? meta.text(notification.payload ?? {}) : ''
}
