import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BoardingPassCard } from '../components/BoardingPassCard'
import { GoogleIcon } from '../components/GoogleIcon'
import { PlaneIcon } from '../components/PlaneIcon'
import styles from './Login.module.css'

export function Login() {
  const { user, signInWithGoogle } = useAuth()
  if (user) return <Navigate to="/" replace />
  return (
    <BoardingPassCard
      eyebrow={
        <>
          <PlaneIcon className={styles.plane} />
          TripPlan
        </>
      }
      code="TP·001"
    >
      <h1 className={styles.title}>Plan trips together.</h1>
      <p className={styles.sub}>Sign in to start your next journey.</p>
      <button type="button" className={styles.google} onClick={signInWithGoogle}>
        <GoogleIcon className={styles.gicon} />
        Sign in with Google
      </button>
    </BoardingPassCard>
  )
}
