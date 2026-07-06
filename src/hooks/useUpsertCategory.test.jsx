import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { from, insert, update, upsert, del, updateEq } = vi.hoisted(() => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: updateEq }))
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const delEq2 = vi.fn().mockResolvedValue({ error: null })
  const delEq1 = vi.fn(() => ({ eq: delEq2 }))
  const del = vi.fn(() => ({ eq: delEq1 }))
  const from = vi.fn(() => ({ insert, update, upsert, delete: del }))
  return { from, insert, update, upsert, del, updateEq }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

import { useUpsertCategory } from './useUpsertCategory'
function wrapper({ children }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}
beforeEach(() => vi.clearAllMocks())

describe('useUpsertCategory', () => {
  it('inserts a new category, upserts a given budget, deletes a blank one', async () => {
    const { result } = renderHook(() => useUpsertCategory('t1'), { wrapper })
    result.current.mutate({ name: 'Meal', budgets: { JPY: 40000, MYR: '' }, createdBy: 'm1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('budget_categories')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 't1', name: 'Meal', created_by: 'm1' }))
    expect(from).toHaveBeenCalledWith('category_budgets')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'c1', currency: 'JPY', amount: 40000 }),
      expect.objectContaining({ onConflict: 'category_id,currency' }),
    )
    expect(del).toHaveBeenCalled() // MYR blank → delete that budget row
  })
  it('updates an existing category by id (no insert)', async () => {
    const { result } = renderHook(() => useUpsertCategory('t1'), { wrapper })
    result.current.mutate({ id: 'c1', name: 'Meals', budgets: {} })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meals' }))
    expect(updateEq).toHaveBeenCalledWith('id', 'c1')
    expect(insert).not.toHaveBeenCalled()
  })
})
