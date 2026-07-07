import { useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { timeToMin, minToTime, resizeDuration } from '../lib/calendar'
import styles from './CalendarBlock.module.css'

export function CalendarBlock({ card, style, canEdit, onSetTime, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [previewDur, setPreviewDur] = useState(null)
  const startRef = useRef(null)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.dndId, disabled: !canEdit })
  const startMin = timeToMin(card.time)
  const dur = previewDur ?? card.durationMin
  const label = startMin != null
    ? `${minToTime(startMin)}${dur ? `–${minToTime(startMin + dur)}` : ''}`
    : ''
  const canResize = canEdit && card.source === 'plan' && startMin != null
  const merged = {
    ...style,
    background: card.color,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
    ...(previewDur != null ? { height: previewDur } : {}),
  }

  function onResizeDown(e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startRef.current = { y: e.clientY, dur: card.durationMin ?? 30 }
  }
  function onResizeMove(e) {
    if (!startRef.current) return
    const raw = startRef.current.dur + (e.clientY - startRef.current.y)
    setPreviewDur(resizeDuration(startMin, raw))
  }
  function onResizeUp(e) {
    if (!startRef.current) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const final = previewDur
    startRef.current = null
    setPreviewDur(null)
    if (final != null && final !== card.durationMin) onSetTime({ durationMin: final })
  }

  return (
    <div ref={setNodeRef} className={styles.block} style={merged} {...attributes} {...listeners}
      onClick={(e) => { if (canEdit) { e.stopPropagation(); setEditing((v) => !v) } }}>
      {label && <span className={styles.time}>{label}</span>}
      <span className={styles.title}>{card.title}</span>
      {canEdit && (
        <button type="button" className={styles.x} aria-label={`Remove ${card.title} from day`}
          onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</button>
      )}
      {editing && canEdit && (
        <TimeEditor time={card.time} durationMin={card.durationMin}
          durationDisabled={card.source === 'transport'} onChange={onSetTime} />
      )}
      {canResize && (
        <div data-testid="resize" className={styles.resize} aria-label={`Resize ${card.title}`}
          onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
          onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  )
}
