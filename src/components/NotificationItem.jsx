import { notificationMeta, notificationText } from '../lib/notifications'
import styles from './NotificationItem.module.css'

export function NotificationItem({ notification }) {
  const meta = notificationMeta(notification.type)
  if (!meta) return null
  return (
    <li className={`${styles.item} ${notification.read_at ? '' : styles.unread}`}>
      <span className={styles.icon} aria-hidden="true">{meta.icon}</span>
      <div className={styles.body}>
        <p className={styles.text}>{notificationText(notification)}</p>
      </div>
    </li>
  )
}
