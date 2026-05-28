import type { ReactNode } from 'react'

type StatCardProps = {
  label: string
  value: string
  subtitle: string
  icon: ReactNode
}

export function StatCard({ label, value, subtitle, icon }: StatCardProps) {
  return (
    <div className="relative flex flex-col rounded-2xl bg-card p-5">
      <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-cream">
        {icon}
      </div>
      <span className="text-xs font-medium lowercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="mt-3 font-display text-4xl font-bold tracking-tightest text-ink">
        {value}
      </span>
      <span className="mt-1 text-xs text-ink-faint">{subtitle}</span>
    </div>
  )
}
