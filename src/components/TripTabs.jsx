import { NavLink } from 'react-router-dom'
import styles from './TripTabs.module.css'

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'planning', label: 'Planning' },
  { to: 'packing', label: 'Packing' },
  { to: 'finance', label: 'Finance' },
  { to: 'discussion', label: 'Discussion' },
]

export function TripTabs() {
  return (
    <nav className={styles.tabs} aria-label="Trip sections">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
