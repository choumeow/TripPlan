import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { callerMember, canWrite } from '../lib/tripAccess'
import { PlanningBacklog } from '../components/PlanningBacklog'
import { PlanningSchedule } from '../components/PlanningSchedule'
import { SuggestionEditorModal } from '../components/SuggestionEditorModal'
import { useDeletePlanItem } from '../hooks/useDeletePlanItem'
import { useDeleteTransport } from '../hooks/useDeleteTransport'
import styles from './Planning.module.css'

export function Planning() {
  const { trip } = useOutletContext()
  const { user } = useAuth()
  const me = callerMember(trip, user?.id)
  const canEdit = canWrite(me?.role)
  const [editor, setEditor] = useState(null) // { initialType } | { planItem } | { transportLeg }
  const delPlan = useDeletePlanItem(trip.id)
  const delTransport = useDeleteTransport(trip.id)

  function handleEdit(source, raw) {
    setEditor(source === 'transport' ? { transportLeg: raw } : { planItem: raw })
  }
  function handleRemove(source, raw) {
    if (!window.confirm('Remove this suggestion?')) return
    if (source === 'transport') delTransport.mutate(raw.id)
    else delPlan.mutate(raw.id)
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

      <div className={styles.panes}>
        <div className={styles.pending}>
          <p className={styles.zone}>Pending · suggestions</p>
          <PlanningBacklog trip={trip} canEdit={canEdit} onEdit={handleEdit} onRemove={handleRemove} />
        </div>
        <div className={styles.plan}>
          <p className={styles.zone}>Planning schedule</p>
          <PlanningSchedule trip={trip} />
        </div>
      </div>

      {editor && (
        <SuggestionEditorModal
          tripId={trip.id} memberId={me?.id ?? null}
          initialType={editor.initialType}
          planItem={editor.planItem} transportLeg={editor.transportLeg}
          onClose={() => setEditor(null)} />
      )}
    </section>
  )
}
