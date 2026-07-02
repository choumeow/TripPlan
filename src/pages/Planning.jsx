import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { computeDrop, parseDndId } from '../lib/schedule'
import { PlanningBacklog } from '../components/PlanningBacklog'
import { PlanningSchedule } from '../components/PlanningSchedule'
import { SuggestionEditorModal } from '../components/SuggestionEditorModal'
import { useDeletePlanItem } from '../hooks/useDeletePlanItem'
import { useDeleteTransport } from '../hooks/useDeleteTransport'
import { useScheduleItem } from '../hooks/useScheduleItem'
import styles from './Planning.module.css'

export function Planning() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)
  const [editor, setEditor] = useState(null)
  const delPlan = useDeletePlanItem(trip.id)
  const delTransport = useDeleteTransport(trip.id)
  const schedule = useScheduleItem(trip.id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function handleEdit(source, raw) {
    setEditor(source === 'transport' ? { transportLeg: raw } : { planItem: raw })
  }
  function handleRemove(source, raw) {
    if (!window.confirm('Remove this suggestion?')) return
    if (source === 'transport') delTransport.mutate(raw.id)
    else delPlan.mutate(raw.id)
  }
  function handleDragEnd(event) {
    const drop = computeDrop(event.active.id, event.over?.id, trip)
    if (drop) schedule.mutate(drop.updates)
  }
  // A scheduled card asks to change its time; card.dndId encodes source+id.
  function handleSetTime(card, patch) {
    const { source, id } = parseDndId(card.dndId)
    schedule.mutate([{ source, id, patch }])
  }
  function handleUnschedule(card) {
    const { source, id } = parseDndId(card.dndId)
    schedule.mutate([{ source, id, patch: { scheduledDate: null, sortOrder: 0 } }])
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Planning</h1>
        {canEdit && (
          <button type="button" className={styles.add} onClick={() => setEditor({ initialType: 'visit' })}>
            + Add suggestion
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className={styles.panes}>
          <div className={styles.pending}>
            <p className={styles.zone}>Pending · suggestions</p>
            <PlanningBacklog trip={trip} canEdit={canEdit} onEdit={handleEdit} onRemove={handleRemove} />
          </div>
          <div className={styles.plan}>
            <p className={styles.zone}>Planning schedule</p>
            <PlanningSchedule trip={trip} canEdit={canEdit} onSetTime={handleSetTime} onRemove={handleUnschedule} />
          </div>
        </div>
      </DndContext>

      {editor && (
        <SuggestionEditorModal
          tripId={trip.id} memberId={me?.id ?? null}
          initialType={editor.initialType} planItem={editor.planItem} transportLeg={editor.transportLeg}
          onClose={() => setEditor(null)} />
      )}
    </section>
  )
}
