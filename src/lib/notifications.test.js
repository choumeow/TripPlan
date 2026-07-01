import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TYPES, notificationMeta, notificationText } from './notifications'

const payload = { actor_name: 'Ana', trip_name: 'Tokyo Trip', role: 'editor' }

describe('notifications config', () => {
  it('every type has an icon, an actionable flag, and a text builder', () => {
    for (const meta of Object.values(NOTIFICATION_TYPES)) {
      expect(typeof meta.icon).toBe('string')
      expect(typeof meta.actionable).toBe('boolean')
      expect(typeof meta.text).toBe('function')
    }
  })

  it('only invite_received is actionable', () => {
    expect(NOTIFICATION_TYPES.invite_received.actionable).toBe(true)
    expect(NOTIFICATION_TYPES.invite_accepted.actionable).toBe(false)
    expect(NOTIFICATION_TYPES.invite_declined.actionable).toBe(false)
  })

  it('builds readable text from the payload', () => {
    expect(notificationText({ type: 'invite_received', payload })).toBe('Ana invited you to Tokyo Trip as editor')
    expect(notificationText({ type: 'invite_accepted', payload })).toBe('Ana accepted your invite to Tokyo Trip')
    expect(notificationText({ type: 'invite_declined', payload })).toBe('Ana declined your invite to Tokyo Trip')
  })

  it('returns null meta / empty text for an unknown type', () => {
    expect(notificationMeta('nope')).toBeNull()
    expect(notificationText({ type: 'nope', payload: {} })).toBe('')
  })
})
