import type { ReactNode } from 'react'
import { useAuth } from '../state/auth'
import { AuthScreens } from '../pages/auth/AuthScreens'
import { TallyMark } from './TallyMark'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <BootScreen />
  if (!session) return <AuthScreens />
  return <>{children}</>
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-ink text-cream">
          <TallyMark size={26} strokeWidth={2.4} />
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Loading…
        </span>
      </div>
    </div>
  )
}
