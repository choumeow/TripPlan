import { useState } from 'react'
import { usePendingInvites } from '../hooks/usePendingInvites'
import { useRespondInvite } from '../hooks/useRespondInvite'
import { NOTIFICATION_TYPES } from '../lib/notifications'
import styles from './InviteBar.module.css'

function respondErrorText(error) {
  return String(error?.message).includes('no pending invite')
    ? 'This invite is no longer available.'
    : 'Could not update this invite. Please try again.'
}

/**
 * Message bar under the app header for the caller's pending trip invites. It has no
 * dismiss: an invite stays up until it is accepted or declined. With several invites it
 * shows the newest one plus a "Show all" toggle that lists the rest.
 */
export function InviteBar() {
  const { invites } = usePendingInvites()
  const respond = useRespondInvite()
  const [expanded, setExpanded] = useState(false)

  if (invites.length === 0) return null
  const many = invites.length > 1
  const showAll = expanded && many
  const visible = showAll ? invites : invites.slice(0, 1)

  return (
    <section className={styles.bar} aria-label="Trip invitations">
      <ul className={styles.list}>
        {visible.map((invite, i) => {
          const failed = respond.isError && respond.variables?.tripId === invite.trip_id
          return (
            <li key={invite.trip_id} className={styles.row}>
              <span className={styles.icon} aria-hidden="true">{NOTIFICATION_TYPES.invite_received.icon}</span>
              <div className={styles.body}>
                <p className={styles.text}>{NOTIFICATION_TYPES.invite_received.text(invite)}</p>
                <div className={styles.actions}>
                  <button type="button" className={styles.accept} disabled={respond.isPending}
                    aria-label={`Accept invite to ${invite.trip_name}`}
                    onClick={() => respond.mutate({ tripId: invite.trip_id, accept: true })}>Accept</button>
                  <button type="button" className={styles.decline} disabled={respond.isPending}
                    aria-label={`Decline invite to ${invite.trip_name}`}
                    onClick={() => respond.mutate({ tripId: invite.trip_id, accept: false })}>Decline</button>
                </div>
                {i === 0 && many && (
                  <button type="button" className={styles.toggle} aria-expanded={showAll}
                    onClick={() => setExpanded(!showAll)}>
                    {showAll ? 'Show less' : `Show all (${invites.length})`}
                  </button>
                )}
                {failed && <p className={styles.err} role="alert">{respondErrorText(respond.error)}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
