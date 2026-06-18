# Foundation (#0): Auth & Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a vertical slice where a user signs in with Google, confirms their name, and lands on an authenticated (empty) dashboard shell.

**Architecture:** React Router drives routing with auth + onboarding route guards. A React `AuthProvider` holds the Supabase session and reacts to `onAuthStateChange`. `@tanstack/react-query` caches the user's `profiles` row. Supabase Postgres owns identity: a trigger auto-creates a `profiles` row on first sign-in, and RLS restricts each profile to its owner.

**Tech Stack:** React 19 + Vite, Supabase (Auth + Postgres + RLS), `react-router-dom`, `@tanstack/react-query`, CSS Modules; Vitest + React Testing Library for tests.

**Spec:** `docs/superpowers/specs/2026-06-18-foundation-design.md`

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/supabaseClient.js` | Single Supabase client instance (moved from `src/supabaseClient.js`), with an env guard |
| `src/auth/AuthContext.jsx` | `AuthProvider` + `useAuth()` — session, user, loading, sign-in/out |
| `src/auth/ProtectedRoute.jsx` | Redirects unauthenticated users to `/login` |
| `src/auth/RequireOnboarded.jsx` | Redirects users who haven't confirmed their name to `/onboarding` |
| `src/hooks/useProfile.js` | react-query hook reading the caller's `profiles` row |
| `src/pages/Login.jsx` | Public "Sign in with Google" page |
| `src/pages/Onboarding.jsx` | "Welcome to TripPlan, what's your name?" screen |
| `src/pages/Dashboard.jsx` | Empty authenticated shell (filled by subsystem #1) |
| `src/App.jsx` | Router + provider wiring (replaces the Vite demo) |
| `src/main.jsx` | Mounts `<App/>` (unchanged structure) |
| `src/test/setup.js` | Vitest global setup (jest-dom matchers) |
| `vite.config.js` | Adds Vitest config block |

**Deferred to subsystem #1 (documented, not built here):** `trips`, `trip_members`, `notifications` tables and the `is_trip_member` / `trip_role` RLS helper functions (they read from `trip_members`, which does not exist yet).

---

## Task 1: Install dependencies & configure Vitest

**Files:**
- Modify: `package.json` (scripts + deps via npm)
- Modify: `vite.config.js`
- Create: `src/test/setup.js`
- Test: `src/test/setup.test.js` (temporary smoke test)

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install react-router-dom @tanstack/react-query
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block, add `test` and `test:run` so it reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run"
  },
```

- [ ] **Step 3: Replace `vite.config.js` with a version that includes Vitest config**

```js
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
```

- [ ] **Step 4: Create the test setup file** `src/test/setup.js`

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Write a temporary smoke test** `src/test/setup.test.js`

```js
import { describe, it, expect } from 'vitest'

describe('test tooling', () => {
  it('runs and has jest-dom matchers', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run the test to verify the toolchain works**

Run: `npm run test:run`
Expected: PASS (1 test passed).

- [ ] **Step 7: Delete the temporary smoke test**

```bash
rm src/test/setup.test.js
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.js src/test/setup.js
git commit -m "chore: add router, react-query, and Vitest test tooling"
```

---

## Task 2: Supabase backend — profiles table, signup trigger, RLS

This task runs SQL in the Supabase dashboard (SQL Editor) and configures Google OAuth. There is no automated test; verification is via SQL queries and a manual login later (Task 10).

**Files:** none in repo (database + dashboard configuration).

- [ ] **Step 1: Create the `profiles` table, signup trigger, and RLS policies**

In Supabase Dashboard → SQL Editor, run:

```sql
-- profiles: one row per authenticated user
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- auto-create a profile row when a new auth user is created
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row-Level Security: a user can read and update only their own profile
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

> No INSERT policy is needed for users: the trigger runs as `security definer`, so it
> bypasses RLS. (Subsystem #1 will broaden `profiles_select_own` so members of a shared
> trip can read each other's display names.)

- [ ] **Step 2: Verify the table and policies exist**

In the SQL Editor, run:

```sql
select tablename, policyname, cmd from pg_policies where tablename = 'profiles';
```

Expected: two rows — `profiles_select_own` (SELECT) and `profiles_update_own` (UPDATE).

- [ ] **Step 3: Enable Google OAuth in Supabase**

1. Google Cloud Console → create an OAuth 2.0 Client ID (type: Web application).
2. Add the Supabase callback URL (Supabase Dashboard → Authentication → Providers →
   Google shows the exact **Callback URL**) to the Google client's **Authorized redirect URIs**.
3. Copy the Google **Client ID** and **Client Secret** into Supabase Dashboard →
   Authentication → Providers → **Google**, and enable the provider.
4. Supabase Dashboard → Authentication → URL Configuration → set **Site URL** to
   `http://localhost:5173` (Vite's dev URL) for local development.

- [ ] **Step 4: Confirm local env values are present**

Confirm `.env` (already git-ignored) contains real values:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

No commit for this task (database/dashboard only).

---

## Task 3: Relocate the Supabase client and add an env guard

**Files:**
- Create: `src/lib/supabaseClient.js`
- Delete: `src/supabaseClient.js`
- Test: `src/lib/supabaseClient.test.js` (temporary)

- [ ] **Step 1: Create `src/lib/supabaseClient.js` with an env guard**

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 2: Delete the old client file**

```bash
rm src/supabaseClient.js
```

- [ ] **Step 3: Write a temporary test that the client module loads** `src/lib/supabaseClient.test.js`

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ marker: 'client' })),
}))

describe('supabaseClient', () => {
  it('exports a created client when env vars are set', async () => {
    const { supabase } = await import('./supabaseClient')
    expect(supabase).toEqual({ marker: 'client' })
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:run -- src/lib/supabaseClient.test.js`
Expected: PASS. (Vitest injects `VITE_SUPABASE_URL`/`ANON_KEY` from `.env` automatically, so the guard does not throw.)

- [ ] **Step 5: Delete the temporary test**

```bash
rm src/lib/supabaseClient.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabaseClient.js
git commit -m "refactor: move supabase client to src/lib with env guard"
```

---

## Task 4: AuthProvider + useAuth (TDD)

**Files:**
- Create: `src/auth/AuthContext.jsx`
- Test: `src/auth/AuthContext.test.jsx`

- [ ] **Step 1: Write the failing test** `src/auth/AuthContext.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getSession = vi.fn()
const onAuthStateChange = vi.fn()
const signInWithOAuth = vi.fn()
const signOut = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signInWithOAuth, signOut },
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

function Probe() {
  const { user, loading } = useAuth()
  return <div>{loading ? 'loading' : user ? `user:${user.id}` : 'anon'}</div>
}

beforeEach(() => {
  vi.clearAllMocks()
  onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

describe('AuthProvider', () => {
  it('starts loading, then resolves to anon when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByText('loading')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument())
  })

  it('exposes the user when a session exists', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'abc' } } },
    })
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByText('user:abc')).toBeInTheDocument())
  })

  it('throws if useAuth is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/useAuth must be used within/)
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/auth/AuthContext.test.jsx`
Expected: FAIL ("Failed to resolve import './AuthContext'" or "useAuth is not a function").

- [ ] **Step 3: Write the implementation** `src/auth/AuthContext.jsx`

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      }),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/auth/AuthContext.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthContext.jsx src/auth/AuthContext.test.jsx
git commit -m "feat: add AuthProvider and useAuth hook"
```

---

## Task 5: useProfile hook (TDD)

**Files:**
- Create: `src/hooks/useProfile.js`
- Test: `src/hooks/useProfile.test.jsx`

- [ ] **Step 1: Write the failing test** `src/hooks/useProfile.test.jsx`

```jsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const single = vi.fn()
const eq = vi.fn(() => ({ single }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))

vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useProfile } from './useProfile'

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useProfile', () => {
  it('fetches the current user profile row', async () => {
    useAuth.mockReturnValue({ user: { id: 'abc' } })
    single.mockResolvedValue({
      data: { id: 'abc', display_name: 'Ana', onboarded: true },
      error: null,
    })

    const { result } = renderHook(() => useProfile(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'abc')
    expect(result.current.data.display_name).toBe('Ana')
  })

  it('is disabled when there is no user', () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useProfile(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/hooks/useProfile.test.jsx`
Expected: FAIL ("Failed to resolve import './useProfile'").

- [ ] **Step 3: Write the implementation** `src/hooks/useProfile.js`

```js
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/hooks/useProfile.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProfile.js src/hooks/useProfile.test.jsx
git commit -m "feat: add useProfile react-query hook"
```

---

## Task 6: Route guards — ProtectedRoute + RequireOnboarded (TDD)

**Files:**
- Create: `src/auth/ProtectedRoute.jsx`
- Create: `src/auth/RequireOnboarded.jsx`
- Test: `src/auth/ProtectedRoute.test.jsx`
- Test: `src/auth/RequireOnboarded.test.jsx`

- [ ] **Step 1: Write the failing test** `src/auth/ProtectedRoute.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))
import { useAuth } from './AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Protected</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ProtectedRoute', () => {
  it('shows a loading state while auth resolves', () => {
    useAuth.mockReturnValue({ user: null, loading: true })
    renderApp()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /login when there is no user', () => {
    useAuth.mockReturnValue({ user: null, loading: false })
    renderApp()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('renders the protected outlet when a user is present', () => {
    useAuth.mockReturnValue({ user: { id: '1' }, loading: false })
    renderApp()
    expect(screen.getByText('Protected')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/auth/ProtectedRoute.test.jsx`
Expected: FAIL ("Failed to resolve import './ProtectedRoute'").

- [ ] **Step 3: Write `src/auth/ProtectedRoute.jsx`**

```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/auth/ProtectedRoute.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test** `src/auth/RequireOnboarded.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../hooks/useProfile', () => ({ useProfile: vi.fn() }))
import { useProfile } from '../hooks/useProfile'
import { RequireOnboarded } from './RequireOnboarded'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireOnboarded />}>
          <Route path="/" element={<div>App Home</div>} />
        </Route>
        <Route path="/onboarding" element={<div>Onboarding Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('RequireOnboarded', () => {
  it('shows loading while the profile loads', () => {
    useProfile.mockReturnValue({ data: undefined, isLoading: true })
    renderApp()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /onboarding when the profile is not onboarded', () => {
    useProfile.mockReturnValue({ data: { onboarded: false }, isLoading: false })
    renderApp()
    expect(screen.getByText('Onboarding Page')).toBeInTheDocument()
  })

  it('renders the outlet when the profile is onboarded', () => {
    useProfile.mockReturnValue({ data: { onboarded: true }, isLoading: false })
    renderApp()
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test:run -- src/auth/RequireOnboarded.test.jsx`
Expected: FAIL ("Failed to resolve import './RequireOnboarded'").

- [ ] **Step 7: Write `src/auth/RequireOnboarded.jsx`**

```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'

export function RequireOnboarded() {
  const { data: profile, isLoading } = useProfile()
  if (isLoading) return <div>Loading…</div>
  if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test:run -- src/auth/RequireOnboarded.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add src/auth/ProtectedRoute.jsx src/auth/ProtectedRoute.test.jsx src/auth/RequireOnboarded.jsx src/auth/RequireOnboarded.test.jsx
git commit -m "feat: add ProtectedRoute and RequireOnboarded route guards"
```

---

## Task 7: Login page (TDD)

**Files:**
- Create: `src/pages/Login.jsx`
- Test: `src/pages/Login.test.jsx`

- [ ] **Step 1: Write the failing test** `src/pages/Login.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
import { useAuth } from '../auth/AuthContext'
import { Login } from './Login'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Login', () => {
  it('calls signInWithGoogle when the button is clicked', async () => {
    const signInWithGoogle = vi.fn()
    useAuth.mockReturnValue({ user: null, signInWithGoogle })
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })

  it('redirects to the dashboard when already signed in', () => {
    useAuth.mockReturnValue({ user: { id: '1' }, signInWithGoogle: vi.fn() })
    renderApp()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/pages/Login.test.jsx`
Expected: FAIL ("Failed to resolve import './Login'").

- [ ] **Step 3: Write `src/pages/Login.jsx`**

```jsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/pages/Login.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Login.jsx src/pages/Login.test.jsx
git commit -m "feat: add Google sign-in Login page"
```

---

## Task 8: Onboarding page (TDD)

The page seeds the name input from the Google-provided `display_name`, lets the user
edit it, then on save writes `display_name` + `onboarded = true`, invalidates the
cached profile, and navigates to the dashboard. If the user is already onboarded it
redirects to the dashboard.

**Files:**
- Create: `src/pages/Onboarding.jsx`
- Test: `src/pages/Onboarding.test.jsx`

- [ ] **Step 1: Write the failing test** `src/pages/Onboarding.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const eq = vi.fn()
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { from } }))

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useProfile', () => ({ useProfile: vi.fn() }))

import { useAuth } from '../auth/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { Onboarding } from './Onboarding'

function renderApp() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'abc' } })
})

describe('Onboarding', () => {
  it('greets the user and pre-fills the name from the profile', () => {
    useProfile.mockReturnValue({
      data: { display_name: 'Ana', onboarded: false },
      isLoading: false,
    })
    renderApp()
    expect(screen.getByText(/welcome to tripplan/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toHaveValue('Ana')
  })

  it('saves the name and onboarded flag, then navigates to the dashboard', async () => {
    useProfile.mockReturnValue({
      data: { display_name: '', onboarded: false },
      isLoading: false,
    })
    eq.mockResolvedValue({ error: null })
    renderApp()

    const input = screen.getByLabelText(/name/i)
    await userEvent.type(input, 'Bob')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ display_name: 'Bob', onboarded: true })
    expect(eq).toHaveBeenCalledWith('id', 'abc')
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument())
  })

  it('redirects to the dashboard if already onboarded', () => {
    useProfile.mockReturnValue({
      data: { display_name: 'Ana', onboarded: true },
      isLoading: false,
    })
    renderApp()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('blocks saving an empty name', async () => {
    useProfile.mockReturnValue({
      data: { display_name: '', onboarded: false },
      isLoading: false,
    })
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/pages/Onboarding.test.jsx`
Expected: FAIL ("Failed to resolve import './Onboarding'").

- [ ] **Step 3: Write `src/pages/Onboarding.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabaseClient'

export function Onboarding() {
  const { user } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name)
  }, [profile?.display_name])

  if (isLoading) return <div>Loading…</div>
  if (profile?.onboarded) return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed, onboarded: true })
      .eq('id', user.id)
    setSaving(false)
    if (error) return
    await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
    navigate('/', { replace: true })
  }

  return (
    <main>
      <h1>Welcome to TripPlan</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="name">What's your name?</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
        <button type="submit" disabled={saving}>
          Continue
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/pages/Onboarding.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Onboarding.jsx src/pages/Onboarding.test.jsx
git commit -m "feat: add onboarding name-confirmation page"
```

---

## Task 9: Dashboard shell placeholder (TDD)

**Files:**
- Create: `src/pages/Dashboard.jsx`
- Test: `src/pages/Dashboard.test.jsx`

- [ ] **Step 1: Write the failing test** `src/pages/Dashboard.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
import { useAuth } from '../auth/AuthContext'
import { Dashboard } from './Dashboard'

beforeEach(() => vi.clearAllMocks())

describe('Dashboard', () => {
  it('renders a heading and a sign-out button', async () => {
    const signOut = vi.fn()
    useAuth.mockReturnValue({ signOut })
    render(<Dashboard />)
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/pages/Dashboard.test.jsx`
Expected: FAIL ("Failed to resolve import './Dashboard'").

- [ ] **Step 3: Write `src/pages/Dashboard.jsx`**

```jsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/pages/Dashboard.test.jsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.jsx src/pages/Dashboard.test.jsx
git commit -m "feat: add empty Dashboard shell with sign-out"
```

---

## Task 10: Wire the router + providers, replace the Vite demo

This replaces the default Vite demo `App.jsx` with the router and provider tree, then
verifies the full flow manually against the real Supabase project.

**Files:**
- Modify: `src/App.jsx` (full replacement)
- Delete: `src/App.css` (Vite demo styles, no longer referenced)
- Test: `src/App.test.jsx`

- [ ] **Step 1: Write the failing test** `src/App.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getSession = vi.fn()
const onAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}))
vi.mock('./lib/supabaseClient', () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}))

import App from './App'

beforeEach(() => vi.clearAllMocks())

describe('App', () => {
  it('shows the Login page when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /sign in with google/i }),
      ).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/App.test.jsx`
Expected: FAIL (App still renders the Vite demo; no sign-in button).

- [ ] **Step 3: Replace `src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RequireOnboarded } from './auth/RequireOnboarded'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<RequireOnboarded />}>
                <Route path="/" element={<Dashboard />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 4: Remove the now-unused Vite demo stylesheet**

```bash
rm src/App.css
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- src/App.test.jsx`
Expected: PASS (1 test).

- [ ] **Step 6: Run the full test suite**

Run: `npm run test:run`
Expected: PASS (all tests across all files green).

- [ ] **Step 7: Manual smoke test against real Supabase**

```bash
npm run dev
```

Then in a browser at `http://localhost:5173`:
1. You are redirected to `/login` and see "Sign in with Google".
2. Click it → complete Google OAuth → you are redirected back.
3. First-time login shows "Welcome to TripPlan, what's your name?" pre-filled from Google.
4. Edit the name → click Continue → you land on the Dashboard.
5. In Supabase Dashboard → Table Editor → `profiles`: your row exists with the chosen
   `display_name` and `onboarded = true`.
6. Reload the page → you go straight to the Dashboard (no onboarding repeat).
7. Click "Sign out" → you return to `/login`.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "feat: wire router, providers, and auth flow; remove Vite demo"
```

- [ ] **Step 9: Push the branch**

```bash
git push
```

---

## Definition of Done

- [ ] `npm run test:run` is fully green.
- [ ] `npm run dev` → the manual smoke test (Task 10, Step 7) passes end-to-end.
- [ ] A `profiles` row is auto-created on first sign-in with `onboarded` flipping to true after the name screen.
- [ ] An unauthenticated visit to `/` redirects to `/login`; an onboarded reload skips onboarding.
- [ ] No secrets committed (`.env` remains git-ignored).
