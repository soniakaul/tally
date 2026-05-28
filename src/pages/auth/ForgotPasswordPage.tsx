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

export function ForgotPasswordPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSentTo(null)
    setLoading(true)
    try {
      const { data: email, error: lookupErr } = await supabase.rpc(
        'get_email_by_username',
        { p_username: username.trim().toLowerCase() },
      )
      if (lookupErr) throw new Error(lookupErr.message)
      if (!email) {
        // Generic message — don't leak whether the username exists.
        setSentTo('hidden')
        return
      }

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/` },
      )
      if (resetErr) throw new Error(resetErr.message)
      // Mask the local part: a***@gmail.com
      const masked = email.replace(/^(.).+(@.+)$/, '$1***$2')
      setSentTo(masked)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password."
      subtitle="We'll email a recovery link to the address on file."
      footer={
        <button
          onClick={onLogin}
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          ← Back to sign in
        </button>
      }
    >
      {sentTo ? (
        <AuthSuccess
          message={
            sentTo === 'hidden'
              ? 'If that username exists, a reset link is on its way.'
              : `Reset link sent to ${sentTo}. Check your inbox.`
          }
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="Username">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className={authInputCls}
            />
          </AuthField>

          {error && <AuthError message={error} />}

          <AuthButton loading={loading}>Send reset link →</AuthButton>
        </form>
      )}
    </AuthShell>
  )
}
