import { useEffect, useState } from 'react'
import { LoginPage } from './LoginPage'
import { SignupPage } from './SignupPage'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { ResetPasswordPage } from './ResetPasswordPage'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

function detectInitialMode(): Mode {
  if (typeof window === 'undefined') return 'login'
  const hash = window.location.hash || ''
  if (hash.includes('type=recovery')) return 'reset'
  return 'login'
}

export function AuthScreens() {
  const [mode, setMode] = useState<Mode>(detectInitialMode)

  // When Supabase parses the recovery hash, it'll surface a PASSWORD_RECOVERY
  // event. Switch to the reset screen in that case too.
  useEffect(() => {
    import('../../lib/supabase').then(({ supabase }) => {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setMode('reset')
      })
      return () => subscription.unsubscribe()
    })
  }, [])

  switch (mode) {
    case 'signup':
      return <SignupPage onLogin={() => setMode('login')} />
    case 'forgot':
      return <ForgotPasswordPage onLogin={() => setMode('login')} />
    case 'reset':
      return <ResetPasswordPage onDone={() => setMode('login')} />
    case 'login':
    default:
      return (
        <LoginPage
          onSignup={() => setMode('signup')}
          onForgot={() => setMode('forgot')}
        />
      )
  }
}
