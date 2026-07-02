import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RequireOnboarded } from './auth/RequireOnboarded'
import { AuthLayout } from './components/AuthLayout'
import { DashboardLayout } from './components/DashboardLayout'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { TripWorkspace } from './pages/TripWorkspace'
import { Overview } from './pages/Overview'
import { Planning } from './pages/Planning'
import { ComingSoon } from './pages/ComingSoon'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Auth pages — centered boarding-pass shell */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/onboarding" element={<Onboarding />} />
              </Route>
            </Route>

            {/* In-app pages — dashboard shell */}
            <Route element={<ProtectedRoute />}>
              <Route element={<RequireOnboarded />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/trip/:tripId" element={<TripWorkspace />}>
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="overview" element={<Overview />} />
                    <Route path="planning" element={<Planning />} />
                    <Route path="packing" element={<ComingSoon section="Packing" />} />
                    <Route path="finance" element={<ComingSoon section="Finance" />} />
                    <Route path="discussion" element={<ComingSoon section="Discussion" />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
