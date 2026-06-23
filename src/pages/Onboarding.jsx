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
