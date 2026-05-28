import type { Household, Person, PersonColor } from '../state/household'
import { PersonAvatar } from './PersonAvatar'

export function HouseholdChip({
  household,
  people,
  onClick,
}: {
  household: Household | null
  people: Person[]
  onClick: () => void
}) {
  const visible = people.slice(0, 3)
  const extra = people.length - visible.length

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 rounded-full border border-edge bg-card/60 py-1.5 pl-2 pr-3 transition hover:border-ink-faint hover:bg-card"
    >
      <div className="flex items-center">
        {visible.map((person, i) => (
          <PersonAvatar
            key={person.id}
            name={person.name}
            color={person.color as PersonColor}
            size="sm"
            className={i > 0 ? '-ml-2 ring-2 ring-cream' : ''}
          />
        ))}
        {extra > 0 && (
          <div className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-cream ring-2 ring-cream">
            +{extra}
          </div>
        )}
      </div>
      <span className="hidden text-xs font-medium text-ink-muted group-hover:text-ink sm:inline">
        {household?.name ?? 'Household'}
      </span>
      <span className="text-ink-faint transition group-hover:text-ink">›</span>
    </button>
  )
}
