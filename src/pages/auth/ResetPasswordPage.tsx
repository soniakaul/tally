import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  AuthButton,
  AuthError,
  AuthField,
  AuthShell,
  AuthSuccess,
  authInputCls,
} from './AuthShell'

export function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }
    setLoading(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw new Error(updErr.message)
      setDone(true)
      // Strip the recovery hash from the URL so reload doesn't re-trigger.
      window.history.replaceState(null, '', window.location.pathname)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Set a new password."
      subtitle="Pick something you'll remember this time."
      footer={
        done && (
          <button
            onClick={onDone}
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            Sign in →
          </button>
        )
      }
    >
      {done ? (
        <AuthSuccess message="Password updated. You can now sign in with the new one." />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="New password" hint="At least 8 characters.">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              className={authInputCls}
            />
          </AuthField>

          <AuthField label="Confirm new password">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={authInputCls}
            />
          </AuthField>

          {error && <AuthError message={error} />}

          <AuthButton loading={loading}>Update password →</AuthButton>
        </form>
      )}
    </AuthShell>
  )
}
