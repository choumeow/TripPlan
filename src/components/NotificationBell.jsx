import { useEffect, useRef, useState } from 'react'
import { BellIcon } from './BellIcon'
import { NotificationItem } from './NotificationItem'
import { useNotifications } from '../hooks/useNotifications'
import { useMarkNotificationsRead } from '../hooks/useMarkNotificationsRead'
import { useRespondInvite } from '../hooks/useRespondInvite'
import styles from './NotificationBell.module.css'

function respondErrorText(error) {
  return String(error?.message).includes('no pending invite')
    ? 'This invite is no longer available.'
    : 'Could not update this invite. Please try again.'
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const { items, unreadCount } = useNotifications()
  const markRead = useMarkNotificationsRead()
  const respond = useRespondInvite()

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unreadCount > 0) markRead.mutate(null)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button type="button" className={styles.iconBtn} aria-label="Notifications"
        aria-expanded={open} onClick={toggle}>
        <BellIcon className={styles.bell} />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-label={`${unreadCount} unread`}>{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className={styles.panel}>
          <p className={styles.head}>Notifications</p>
          {respond.isError && (
            <p className={styles.err} role="alert">{respondErrorText(respond.error)}</p>
          )}
          {items.length === 0 ? (
            <p className={styles.empty}>No notifications yet.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <NotificationItem key={n.id} notification={n} pending={respond.isPending}
                  onAccept={(x) => respond.mutate({ tripId: x.payload.trip_id, accept: true })}
                  onDecline={(x) => respond.mutate({ tripId: x.payload.trip_id, accept: false })} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
