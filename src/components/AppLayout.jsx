import { Outlet } from 'react-router-dom'
import styles from './AppLayout.module.css'

/**
 * Shared shell for every page: an ambient sky→mist wash with a faint dashed
 * route line (origin → destination pins) behind a centered content slot.
 * Pages render into <Outlet/>.
 */
export function AppLayout() {
  return (
    <div className={styles.layout}>
      <svg
        className={styles.route}
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path d="M -40 660 Q 360 700 600 470 T 1240 170" />
        <circle className={styles.pin} cx="118" cy="676" r="7" />
        <circle className={styles.pin} cx="1132" cy="214" r="7" />
      </svg>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
