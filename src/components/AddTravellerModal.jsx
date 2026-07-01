import { useState } from 'react'
import { Modal } from './Modal'
import { useInviteMember } from '../hooks/useInviteMember'
import { useAddGhost } from '../hooks/useAddGhost'
import styles from './AddTravellerModal.module.css'

const MODES = [
  { key: 'invite', label: 'Invite by email' },
  { key: 'ghost', label: 'Add ghost' },
]
const ROLES = [
  { key: 'editor', label: 'Editor' },
  { key: 'viewer', label: 'Viewer' },
]
const EMAIL_RE = /^\S+@\S+\.\S+$/

export function AddTravellerModal({ onClose, tripId }) {
  const [mode, setMode] = useState('invite')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const invite = useInviteMember(tripId)
  const addGhost = useAddGhost(tripId)
  const pending = invite.isPending || addGhost.isPending

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  function submitInvite(e) {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_RE.test(value)) { setError('Enter a valid email address.'); return }
    setError('')
    invite.mutate({ email: value, role }, {
      onSuccess: onClose,
      onError: (err) => setError(
        String(err?.message).includes('no user')
          ? 'No TripPlan user with that email.'
          : String(err?.message).includes('already')
            ? 'That person is already on this trip.'
            : 'Could not send this invite. Please try again.',
      ),
    })
  }

  function submitGhost(e) {
    e.preventDefault()
    const value = name.trim()
    if (!value) { setError('Enter a name.'); return }
    setError('')
    addGhost.mutate(value, {
      onSuccess: onClose,
      onError: () => setError('Could not add this joiner. Please try again.'),
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="Add a traveller">
      <form className={styles.pass} noValidate onSubmit={mode === 'invite' ? submitInvite : submitGhost}>
        <div className={styles.colbar} />
        <div className={styles.pad}>
          <p className={styles.ey}>NEW TRAVELLER</p>

          <div className={styles.toggle} role="group" aria-label="Add mode">
            {MODES.map((m) => (
              <button key={m.key} type="button"
                className={`${styles.toggleBtn} ${mode === m.key ? styles.toggleOn : ''}`}
                aria-pressed={mode === m.key}
                onClick={() => switchMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'invite' ? (
            <>
              <label className={styles.label} htmlFor="inv-email">Email</label>
              <input id="inv-email" type="email" className={styles.input}
                value={email} onChange={(e) => setEmail(e.target.value)} />

              <span className={styles.label} id="role-label">Role</span>
              <div className={styles.chips} role="group" aria-labelledby="role-label">
                {ROLES.map((r) => (
                  <button key={r.key} type="button"
                    className={`${styles.chip} ${role === r.key ? styles.chipOn : ''}`}
                    aria-pressed={role === r.key}
                    onClick={() => setRole(r.key)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className={styles.label} htmlFor="ghost-name">Name</label>
              <input id="ghost-name" className={styles.input}
                value={name} onChange={(e) => setName(e.target.value)} />
              <p className={styles.hint}>A ghost joiner has no account — they just appear on the trip.</p>
            </>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submit} disabled={pending}>
              {pending ? 'Saving…' : mode === 'invite' ? 'Send invite' : 'Add joiner'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
