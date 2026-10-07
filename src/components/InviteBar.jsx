import { useId, useState } from 'react'
import { ChevronIcon } from './ChevronIcon'
import { usePendingInvites } from '../hooks/usePendingInvites'
import { useRespondInvite } from '../hooks/useRespondInvite'
import { NOTIFICATION_TYPES } from '../lib/notifications'
import styles from './InviteBar.module.css'

function respondErrorText(error) {
  return String(error?.message).includes('no pending invite')
    ? 'This invite is no longer available.'
    : 'Could not update this invite. Please try again.'
}

function InviteRow({ invite, respond }) {
  const failed = respond.isError && respond.variables?.tripId === invite.trip_id
  return (
    <li className={styles.row}>
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
        {failed && <p className={styles.err} role="alert">{respondErrorText(respond.error)}</p>}
      </div>
    </li>
  )
}

/**
 * Message bar under the app header for the caller's pending trip invites. It has no
 * dismiss: an invite stays up until it is accepted or declined. With several invites it
 * shows the newest one, and an expander at the foot of the bar slides the rest open.
 */
export function InviteBar() {
  const { invites } = usePendingInvites()
  const respond = useRespondInvite()
  const [expanded, setExpanded] = useState(false)
  const moreId = useId()

  if (invites.length === 0) return null
  const [newest, ...rest] = invites
  const open = expanded && rest.length > 0

  return (
    <section className={styles.bar} aria-label="Trip invitations">
      <ul className={styles.list}>
        <InviteRow invite={newest} respond={respond} />
      </ul>
      {rest.length > 0 && (
        <>
          {/* Stays mounted so it can animate open and shut; inert while shut. */}
          <div id={moreId} className={`${styles.more} ${open ? styles.open : ''}`}
            inert={!open} aria-hidden={open ? undefined : true}>
            <div className={styles.clip}>
              <ul className={`${styles.list} ${styles.moreList}`}>
                {rest.map((invite) => <InviteRow key={invite.trip_id} invite={invite} respond={respond} />)}
              </ul>
            </div>
          </div>
          <button type="button" className={styles.expander} aria-expanded={open}
            aria-controls={moreId} onClick={() => setExpanded(!open)}>
            <ChevronIcon className={styles.chevron} />
            {open ? 'Show less' : `Show all (${invites.length})`}
          </button>
        </>
      )}
    </section>
  )
}
