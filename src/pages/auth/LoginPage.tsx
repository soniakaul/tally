import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  AuthButton,
  AuthError,
  AuthField,
  AuthShell,
  authInputCls,
} from './AuthShell'

export function LoginPage({
  onSignup,
  onForgot,
}: {
  onSignup: () => void
  onForgot: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: email, error: lookupErr } = await supabase.rpc(
        'get_email_by_username',
        { p_username: username.trim().toLowerCase() },
      )
      if (lookupErr) throw new Error(lookupErr.message)
      if (!email) throw new Error('No account with that username.')

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInErr) throw new Error('Wrong password.')
      // On success, AuthProvider picks up the session and re-renders the gate.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome."
      subtitle="Sign in to your household."
      footer={
        <button
          onClick={onSignup}
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Create a new household →
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="Username">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className={authInputCls}
          />
        </AuthField>

        <AuthField label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={authInputCls}
          />
        </AuthField>

        {error && <AuthError message={error} />}

        <AuthButton loading={loading}>Sign in →</AuthButton>

        <div className="text-center">
          <button
            type="button"
            onClick={onForgot}
            className="text-xs font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot password?
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
