import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'

export function RequireOnboarded() {
  const { data: profile, isLoading, isError, refetch } = useProfile()

  if (isLoading) return <div>Loading…</div>

  // A failed profile read must NOT silently fall through to the app — surface
  // it with a retry instead of guessing the user is onboarded.
  if (isError || !profile) {
    return (
      <div role="alert">
        <p>We couldn&apos;t load your profile. Check your connection and try again.</p>
        <button type="button" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    )
  }

  if (!profile.onboarded) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
