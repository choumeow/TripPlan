// Single source of truth: currency code → { symbol, name }. Drives the "Other" dropdown + all formatting.
export const CURRENCIES = {
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  THB: { symbol: '฿', name: 'Thai Baht' },
  KRW: { symbol: '₩', name: 'South Korean Won' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CNY: { symbol: 'CN¥', name: 'Chinese Yuan' },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah' },
  VND: { symbol: '₫', name: 'Vietnamese Dong' },
  TWD: { symbol: 'NT$', name: 'New Taiwan Dollar' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)

export function currencyMeta(code) {
  return CURRENCIES[code] ?? { symbol: code, name: code }
}

// "¥12,000" / "RM160". No forced decimals; up to 2 shown when present.
export function formatMoney(amount, code) {
  const n = Number(amount ?? 0)
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${currencyMeta(code).symbol}${s}`
}
