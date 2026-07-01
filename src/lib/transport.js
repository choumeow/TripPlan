// Single source of truth for transport methods. The stored shape is constant
// (from / to / reference); only the field LABELS change per method.
export const TRANSPORT_METHODS = {
  flight: { label: 'Flight', icon: '✈', from: 'From airport', to: 'To airport', ref: 'Flight no.' },
  train:  { label: 'Train',  icon: '🚆', from: 'From station', to: 'To station', ref: 'Train / line' },
  bus:    { label: 'Bus',    icon: '🚌', from: 'From terminal', to: 'To terminal', ref: 'Operator' },
  car:    { label: 'Car',    icon: '🚗', from: 'From', to: 'To', ref: null },
  ferry:  { label: 'Ferry',  icon: '⛴', from: 'From port', to: 'To port', ref: 'Operator' },
  other:  { label: 'Other',  icon: '•', from: 'From', to: 'To', ref: 'Details' },
}

export const METHOD_KEYS = Object.keys(TRANSPORT_METHODS)

export function methodMeta(method) {
  return TRANSPORT_METHODS[method] ?? TRANSPORT_METHODS.other
}

// A fresh add-form for a direction, with the trip's default date pre-filled.
export function blankLeg(direction, defaultDate) {
  return {
    direction,
    method: 'flight',
    departDate: defaultDate ?? '',
    departTime: '',
    from: '',
    to: '',
    reference: '',
  }
}

// DB row -> edit-form shape (camelCase, no nulls).
export function rowToForm(row) {
  return {
    id: row.id,
    direction: row.direction,
    method: row.method,
    departDate: row.depart_date ?? '',
    departTime: row.depart_time ?? '',
    from: row.from_text ?? '',
    to: row.to_text ?? '',
    reference: row.reference ?? '',
  }
}
