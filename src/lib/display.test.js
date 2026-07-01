import { describe, it, expect } from 'vitest'
import { initials } from './display'

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
