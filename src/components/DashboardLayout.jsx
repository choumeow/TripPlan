import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Logo } from './Logo'
import { BellIcon } from './BellIcon'
import styles from './DashboardLayout.module.css'

/**
 * Shell for in-app pages (Dashboard and later subsystems): a sticky top bar
 * with the brand, a notification bell, and sign-out, over a full-width content
 * container. Pages render into <Outlet/>.
 */
export function DashboardLayout() {
  const { signOut } = useAuth()
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link to="/" className={styles.brand}>
          <Logo className={styles.logo} />
          TripPlan
        </Link>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Notifications"
          >
            <BellIcon className={styles.bell} />
          </button>
          <button type="button" className={styles.signout} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.container}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
