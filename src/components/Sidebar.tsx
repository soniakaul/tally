import { cn } from '../lib/utils'
import { useAuth } from '../state/auth'
import { useHousehold } from '../hooks/useHousehold'
import { usePeople } from '../hooks/usePeople'
import { TallyMark } from './TallyMark'

type NavItem = { key: string; label: string; icon: string }

const items: NavItem[] = [
  { key: 'dashboard', label: 'Payments', icon: '⌂' },
  { key: 'items', label: 'Items', icon: '◇' },
  { key: 'settings', label: 'Settings', icon: '✦' },
]

export function Sidebar({
  active = 'dashboard',
  onNavigate,
  isOpen = false,
  onClose,
}: {
  active?: string
  onNavigate?: (key: string) => void
  isOpen?: boolean
  onClose?: () => void
}) {
  const { signOut } = useAuth()
  const { household } = useHousehold()
  const { people } = usePeople()

  const names = people.map((p) => p.name).filter(Boolean)
  const nameList =
    names.length === 0
      ? 'no one yet'
      : names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-edge bg-cream px-3 py-5 transition-transform md:relative md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="mb-8 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-cream">
              <TallyMark size={18} strokeWidth={2.2} />
            </div>
            <span className="font-display text-xl font-bold tracking-tightest text-ink">
              tally
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-faint transition hover:bg-card hover:text-ink md:hidden"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate?.(item.key)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                active === item.key
                  ? 'bg-ink text-cream'
                  : 'text-ink-muted hover:bg-card hover:text-ink',
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2">
          <div className="rounded-xl border border-edge bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber" />
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                WhatsApp pending
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">
                {household?.name ?? 'Your household'}
              </span>
              <br />
              {names.length > 0 ? (
                <>
                  Reminders for{' '}
                  <span className="font-medium text-ink">{nameList}</span>
                </>
              ) : (
                'Add people to receive reminders'
              )}
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-edge bg-cream px-3 py-2 text-xs font-medium text-ink-muted transition hover:bg-card hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
