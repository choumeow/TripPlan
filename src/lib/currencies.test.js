import { describe, it, expect } from 'vitest'
import { CURRENCIES, CURRENCY_CODES, currencyMeta, formatMoney } from './currencies'

describe('currencies', () => {
  it('includes the common trip currencies with symbol + name', () => {
    for (const code of ['MYR', 'JPY', 'USD', 'EUR']) {
      expect(CURRENCIES[code].symbol).toBeTruthy()
      expect(CURRENCIES[code].name).toBeTruthy()
    }
    expect(CURRENCY_CODES).toContain('MYR')
  })
  it('currencyMeta falls back to the code itself for an unknown currency', () => {
    expect(currencyMeta('ZZZ')).toEqual({ symbol: 'ZZZ', name: 'ZZZ' })
    expect(currencyMeta('JPY').symbol).toBe('¥')
  })
  it('formatMoney prefixes the symbol and groups thousands', () => {
    expect(formatMoney(12000, 'JPY')).toBe('¥12,000')
    expect(formatMoney(160, 'MYR')).toBe('RM160')
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.5')
    expect(formatMoney(null, 'JPY')).toBe('¥0')
  })
})
