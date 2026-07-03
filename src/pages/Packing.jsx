import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { memberName, initials } from '../lib/display'
import { partition, progress } from '../lib/packing'
import { PackingRail } from '../components/PackingRail'
import { PackingList } from '../components/PackingList'
import { PackingItemEditorModal } from '../components/PackingItemEditorModal'
import { useTogglePacked } from '../hooks/useTogglePacked'
import { useDeletePackingItem } from '../hooks/useDeletePackingItem'
import styles from './Packing.module.css'

const HINTS = {
  shared: 'Visible to everyone. Anyone can tick an item packed; host & editors add, assign or delete.',
  personal: 'Private to you — nobody else can see this list.',
  ghost: 'Ghost traveller (no login) — visible to all contributors, managed by host & editors.',
}

export function Packing() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const me = callerMember(trip, user?.id)
  const isWriter = canWrite(me?.role)
  const part = partition(trip.packing_items, trip.trip_members, user?.id)

  const [selected, setSelected] = useState('shared')
  const [editor, setEditor] = useState(null)
  const toggle = useTogglePacked(trip.id)
  const del = useDeletePackingItem(trip.id)

  // Rail entries (shared + your list + one per ghost).
  const entries = [
    { id: 'shared', label: 'Shared', glyph: '🎒', tag: null, ghost: false, ...progress(part.shared) },
    { id: 'you', label: 'Your list', glyph: '🧳', tag: 'Private', ghost: false, ...progress(part.mine) },
    ...part.ghostLists.map((g) => ({
      id: g.member.id, label: memberName(g.member), glyph: initials(memberName(g.member)),
      tag: 'Ghost', ghost: true, ...progress(g.items),
    })),
  ]

  // Resolve the active list from `selected`.
  const active = resolveActive(selected, part, me, isWriter)

  function onToggle(item) { toggle.mutate({ id: item.id, packed: !item.packed }) }
  function onAdd() { setEditor({ scope: active.scope, ownerMemberId: active.ownerMemberId, item: null }) }
  function onEdit(item) { setEditor({ scope: item.scope, ownerMemberId: item.owner_member_id, item }) }
  function onRemove(item) { if (window.confirm('Remove this item?')) del.mutate(item.id) }

  return (
    <section className={styles.wrap}>
      <div className={styles.shell}>
        <PackingRail overall={progress(trip.packing_items)} entries={entries} selected={selected} onSelect={setSelected} />
        <PackingList
          title={active.title} glyph={active.glyph} scope={active.scope}
          items={active.items} members={trip.trip_members}
          canAdd={active.canManage} canManage={active.canManage} hint={active.hint}
          onAdd={onAdd} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} />
      </div>

      {editor && (
        <PackingItemEditorModal
          tripId={trip.id} memberId={me?.id ?? null}
          scope={editor.scope} ownerMemberId={editor.ownerMemberId}
          members={trip.trip_members} item={editor.item}
          onClose={() => setEditor(null)} />
      )}
    </section>
  )
}

// Which list is shown + whether the caller may manage it.
function resolveActive(selected, part, me, isWriter) {
  if (selected === 'you') {
    return { scope: 'personal', ownerMemberId: me?.id ?? null, items: part.mine,
      title: 'Your list', glyph: '🧳', hint: HINTS.personal, canManage: !!me }
  }
  const ghost = part.ghostLists.find((g) => g.member.id === selected)
  if (ghost) {
    return { scope: 'personal', ownerMemberId: ghost.member.id, items: ghost.items,
      title: `${memberName(ghost.member)}'s list`, glyph: '👤', hint: HINTS.ghost, canManage: isWriter }
  }
  return { scope: 'shared', ownerMemberId: null, items: part.shared,
    title: 'Shared', glyph: '🎒', hint: HINTS.shared, canManage: isWriter }
}
