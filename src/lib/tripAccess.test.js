import { describe, it, expect } from 'vitest'
import { callerMember, canWrite } from './tripAccess'

const trip = {
  trip_members: [
    { id: 'm1', user_id: 'u1', role: 'host' },
    { id: 'm2', user_id: 'u2', role: 'viewer' },
  ],
}

describe('callerMember', () => {
  it('returns the membership row for the current user', () => {
    expect(callerMember(trip, 'u1')).toEqual({ id: 'm1', user_id: 'u1', role: 'host' })
  })
  it('returns null when the user is not a member, or inputs are missing', () => {
    expect(callerMember(trip, 'nope')).toBeNull()
    expect(callerMember(null, 'u1')).toBeNull()
    expect(callerMember(trip, undefined)).toBeNull()
  })
})

describe('canWrite', () => {
  it('is true for host and editor only', () => {
    expect(canWrite('host')).toBe(true)
    expect(canWrite('editor')).toBe(true)
    expect(canWrite('viewer')).toBe(false)
    expect(canWrite(null)).toBe(false)
    expect(canWrite(undefined)).toBe(false)
  })
})
