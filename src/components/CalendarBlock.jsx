import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { timeToMin, minToTime } from '../lib/calendar'
import styles from './CalendarBlock.module.css'

export function CalendarBlock({ card, style, canEdit, onSetTime, onRemove }) {
  const [editing, setEditing] = useState(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.dndId, disabled: !canEdit })
  const startMin = timeToMin(card.time)
  const label = startMin != null
    ? `${minToTime(startMin)}${card.durationMin ? `–${minToTime(startMin + card.durationMin)}` : ''}`
    : ''
  const merged = {
    ...style,
    background: card.color,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
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
    </div>
  )
}
