import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabaseClient'
import { BoardingPassCard } from '../components/BoardingPassCard'
import { PlaneIcon } from '../components/PlaneIcon'
import styles from './Onboarding.module.css'

// Gate the async profile load here so the form below mounts once with its
// initial name — no effect needed to sync state to loaded data.
export function Onboarding() {
  const { data: profile, isLoading } = useProfile()
  if (isLoading) return <div className={styles.loading}>Loading…</div>
  if (profile?.onboarded) return <Navigate to="/" replace />
  return <OnboardingForm initialName={profile?.display_name ?? ''} />
}

function OnboardingForm({ initialName }) {
  const { user } = useAuth()
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
    <BoardingPassCard
      eyebrow={
        <>
          <PlaneIcon className={styles.plane} />
          Boarding pass
        </>
      }
      code="TP·002"
    >
      <h1 className={styles.title}>Welcome to TripPlan</h1>
      <p className={styles.sub}>One detail before you board.</p>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label htmlFor="name" className={styles.label}>
          What's your name?
        </label>
        <input
          id="name"
          className={styles.input}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Ana"
          autoFocus
        />
        <button type="submit" className={styles.submit} disabled={saving}>
          Continue
        </button>
      </form>
    </BoardingPassCard>
  )
}
