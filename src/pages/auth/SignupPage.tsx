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

const USERNAME_RE = /^[a-z0-9_]{3,24}$/

const DEFAULT_HOUSEHOLD_NAME = 'My household'

export function SignupPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verificationSent, setVerificationSent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const u = username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      setError(
        'Username must be 3–24 characters, lowercase letters, numbers, or underscore.',
      )
      return
    }
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
      // Pre-check username uniqueness so we don't strand an auth row
      const { data: takenEmail } = await supabase.rpc(
        'get_email_by_username',
        { p_username: u },
      )
      if (takenEmail) {
        throw new Error('That username is taken. Try another.')
      }

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (signUpErr) throw new Error(signUpErr.message)
      if (!data.session) {
        // Email verification is enabled for this Supabase project. Tell the
        // user to confirm, and skip household setup — we'll run it after they
        // sign in for the first time.
        const masked = email.trim().replace(/^(.).+(@.+)$/, '$1***$2')
        setVerificationSent(masked)
        return
      }

      // Now atomically create household + profile + defaults.
      const { error: setupErr } = await supabase.rpc('setup_new_household', {
        p_username: u,
        p_email: email.trim(),
        p_household_name: DEFAULT_HOUSEHOLD_NAME,
      })
      if (setupErr) throw new Error(setupErr.message)
      // AuthProvider already picks up the session — gate re-renders.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={verificationSent ? 'Check your inbox.' : 'Create a household.'}
      subtitle={
        verificationSent
          ? 'We sent a verification link. Click it to finish setting up your household.'
          : 'One account, shared by everyone in the home. You can rename the household anytime.'
      }
      footer={
        <button
          onClick={onLogin}
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          {verificationSent
            ? '← Back to sign in'
            : 'Already have an account? Sign in →'}
        </button>
      }
    >
      {verificationSent ? (
        <AuthSuccess
          message={`Verification email sent to ${verificationSent}.`}
        />
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="Username"
          hint="What you'll log in with. Lowercase, no spaces."
        >
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="e.g. kaul_household"
            autoComplete="username"
            autoFocus
            className={authInputCls}
          />
        </AuthField>

        <AuthField
          label="Recovery email"
          hint="Where we'll send the reset link if you forget your password. Head-of-household's email is fine."
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={authInputCls}
          />
        </AuthField>

        <AuthField label="Password" hint="At least 8 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={authInputCls}
          />
        </AuthField>

        <AuthField label="Confirm password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={authInputCls}
          />
        </AuthField>

        {error && <AuthError message={error} />}

        <AuthButton loading={loading}>Create household →</AuthButton>
      </form>
      )}
    </AuthShell>
  )
}
