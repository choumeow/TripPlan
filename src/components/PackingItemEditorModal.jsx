import { useState } from 'react'
import { Modal } from './Modal'
import { PACKING_CATEGORY_ORDER, packingCategoryMeta } from '../lib/packingCategories'
import { memberName } from '../lib/display'
import { useUpsertPackingItem } from '../hooks/useUpsertPackingItem'
import styles from './PackingItemEditorModal.module.css'

export function PackingItemEditorModal({ tripId, memberId, scope, ownerMemberId, members, item, onClose }) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [category, setCategory] = useState(item?.category ?? 'other')
  const [assignee, setAssignee] = useState(item?.assignee_member_id ?? '')
  const [error, setError] = useState('')
  const upsert = useUpsertPackingItem(tripId)
  const isEdit = !!item?.id
  const isShared = scope === 'shared'

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setError('An item title is required.'); return }
    setError('')
    upsert.mutate(
      {
        ...(isEdit ? { id: item.id } : {}),
        scope,
        owner_member_id: ownerMemberId,
        category,
        title: title.trim(),
        assignee_member_id: isShared ? (assignee || null) : null,
        createdBy: memberId,
      },
      { onSuccess: onClose, onError: () => setError('Could not save. Please try again.') },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit item' : 'Add an item'}>
      <form className={styles.pass} noValidate onSubmit={handleSubmit}>
        <div className={styles.colbar} style={{ background: packingCategoryMeta(category).color }} />
        <div className={styles.pad}>
          <p className={styles.ey}>{isEdit ? 'EDIT ITEM' : 'NEW ITEM'}</p>

          <label className={styles.label} htmlFor="pk-name">Item name</label>
          <input id="pk-name" className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />

          <span className={styles.label} id="pk-cat-label">Category</span>
          <div className={styles.chips} role="group" aria-labelledby="pk-cat-label">
            {PACKING_CATEGORY_ORDER.map((key) => {
              const c = packingCategoryMeta(key)
              return (
                <button key={key} type="button"
                  className={`${styles.chip} ${category === key ? styles.chipOn : ''}`}
                  style={category === key ? { borderColor: c.color, color: c.color } : undefined}
                  aria-pressed={category === key}
                  onClick={() => setCategory(key)}>
                  <span aria-hidden="true">{c.glyph}</span> {c.label}
                </button>
              )
            })}
          </div>

          {isShared && (
            <>
              <label className={styles.label} htmlFor="pk-assignee">Assign to · optional</label>
              <select id="pk-assignee" className={styles.input} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{memberName(m)}</option>
                ))}
              </select>
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save item'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
