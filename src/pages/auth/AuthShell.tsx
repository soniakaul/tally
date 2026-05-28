import type { ReactNode } from 'react'
import { TallyMark } from '../../components/TallyMark'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="dotted-bg flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-cream">
            <TallyMark size={22} strokeWidth={2.4} />
          </div>
          <span className="font-display text-2xl font-bold tracking-tightest text-ink">
            tally
          </span>
        </div>
        <div className="rounded-2xl border border-edge bg-card/60 p-7 shadow-sm">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tightest text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
        {footer && (
          <div className="mt-5 text-center text-sm text-ink-muted">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export const authInputCls =
  'w-full rounded-lg border border-edge bg-cream/60 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none'

export function AuthField({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

export function AuthError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-terracotta/30 bg-terracotta-soft px-3 py-2 text-xs font-medium text-terracotta">
      {message}
    </div>
  )
}

export function AuthSuccess({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-sage/30 bg-sage-soft px-3 py-2 text-xs font-medium text-sage">
      {message}
    </div>
  )
}

export function AuthButton({
  loading,
  children,
}: {
  loading?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group flex w-full items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-sm font-medium text-cream transition hover:bg-ink-muted disabled:cursor-not-allowed disabled:bg-edge disabled:text-ink-faint"
    >
      {loading ? 'Working…' : children}
    </button>
  )
}
