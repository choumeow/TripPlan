import { useAuth } from '../auth/AuthContext'

export function Dashboard() {
  const { signOut } = useAuth()
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Your trips will appear here.</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </main>
  )
}
