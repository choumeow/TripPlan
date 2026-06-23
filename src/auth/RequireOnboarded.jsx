import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'

export function RequireOnboarded() {
  const { data: profile, isLoading } = useProfile()
  if (isLoading) return <div>Loading…</div>
  if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
