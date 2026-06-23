import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Login() {
  const { user, signInWithGoogle } = useAuth()
  if (user) return <Navigate to="/" replace />
  return (
    <main>
      <h1>TripPlan</h1>
      <button type="button" onClick={signInWithGoogle}>
        Sign in with Google
      </button>
    </main>
  )
}
