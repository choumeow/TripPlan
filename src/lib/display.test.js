import { describe, it, expect } from 'vitest'
import { initials, memberName } from './display'

describe('initials', () => {
  it('returns the uppercased first character, trimmed', () => {
    expect(initials('Ana')).toBe('A')
    expect(initials('  ben')).toBe('B')
  })
  it('falls back to ? for empty or nullish names', () => {
    expect(initials('')).toBe('?')
    expect(initials(null)).toBe('?')
  })
})

describe('memberName', () => {
  it('prefers the linked profile name, then the row display_name', () => {
    expect(memberName({ profiles: { display_name: 'Ana P' }, display_name: 'Ana' })).toBe('Ana P')
    expect(memberName({ profiles: null, display_name: 'Grandma' })).toBe('Grandma')
  })
  it('falls back to "Guest" for empty members', () => {
    expect(memberName(null)).toBe('Guest')
    expect(memberName({})).toBe('Guest')
  })
})
