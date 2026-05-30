import { useEffect, useRef, useState } from 'react'
import {
  nextColor,
  newPersonId,
  personColors,
  type Person,
  type PersonColor,
} from '../state/household'
import { colorBgClass } from '../state/colors'
import { cn } from '../lib/utils'
import { useHousehold } from '../hooks/useHousehold'
import { usePeople } from '../hooks/usePeople'
import { useDebouncedSync } from '../hooks/useDebouncedSync'
import { PersonAvatar } from './PersonAvatar'

export function HouseholdDialog({ onClose }: { onClose: () => void }) {
  const { household, update: updateHousehold } = useHousehold()
  const { people, add: addPerson, update: updatePerson, remove: removePerson } =
    usePeople()

  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openPickerFor) setOpenPickerFor(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, openPickerFor])

  const handleAddPerson = () => {
    const usedColors = people.map((p) => p.color)
    const newColor = nextColor(usedColors)
    void addPerson({
      id: newPersonId(people.map((p) => p.id)),
      name: '',
      whatsapp: '',
      color: newColor,
      sort_order: people.length,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-cream shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-edge px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-ink">
              Edit household
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Rename the household, add or remove people, change their profile color.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition hover:bg-card hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Household name
          </label>
          <HouseholdNameInput
            initial={household?.name ?? ''}
            onSync={(name) => void updateHousehold({ name })}
          />
        </div>

        <div className="px-6 pb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              People ({people.length})
            </label>
            <span className="text-xs text-ink-faint">
              Tap an avatar to pick a profile color
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                pickerOpen={openPickerFor === person.id}
                onTogglePicker={() =>
                  setOpenPickerFor((prev) =>
                    prev === person.id ? null : person.id,
                  )
                }
                onUpdate={(patch) =>
                  void updatePerson({ id: person.id, patch })
                }
                onRemove={
                  people.length > 1
                    ? () => void removePerson(person.id)
                    : undefined
                }
              />
            ))}
          </div>

          <button
            onClick={handleAddPerson}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-edge bg-card/40 px-3 py-2 text-sm font-medium text-ink-muted transition hover:border-ink-faint hover:bg-card hover:text-ink"
          >
            <span className="text-base leading-none">+</span> Add person
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-edge px-6 py-4">
          <p className="text-xs text-ink-faint">Changes save automatically.</p>
          <button
            onClick={onClose}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream transition hover:bg-ink-muted"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function PersonRow({
  person,
  pickerOpen,
  onTogglePicker,
  onUpdate,
  onRemove,
}: {
  person: Person
  pickerOpen: boolean
  onTogglePicker: () => void
  onUpdate: (patch: Partial<Person>) => void
  onRemove?: () => void
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onTogglePicker()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pickerOpen, onTogglePicker])

  // Local state for text inputs so each keystroke isn't a network call.
  // Debounced sync flushes 400ms after the user stops typing.
  const [name, setName] = useState(person.name)
  const [whatsapp, setWhatsapp] = useState(person.whatsapp)
  useDebouncedSync(name, (v) => onUpdate({ name: v }))
  useDebouncedSync(whatsapp, (v) => onUpdate({ whatsapp: v }))

  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-card/40 p-3">
      <div className="relative">
        <button
          onClick={onTogglePicker}
          className="rounded-full ring-cream ring-offset-2 transition hover:ring-2 hover:ring-ink"
          title="Change profile color"
        >
          <PersonAvatar
            name={name || '?'}
            color={person.color as PersonColor}
            size="lg"
          />
        </button>

        {pickerOpen && (
          <div
            ref={popoverRef}
            className="absolute left-0 top-full z-10 mt-2 w-[208px] rounded-xl border border-edge bg-cream p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Profile color
            </div>
            <div className="grid grid-cols-5 gap-2">
              {personColors.map((c: PersonColor) => (
                <button
                  key={c}
                  onClick={() => {
                    onUpdate({ color: c })
                    onTogglePicker()
                  }}
                  aria-label={c}
                  className={cn(
                    'h-7 w-7 rounded-full transition hover:scale-110',
                    colorBgClass[c],
                    person.color === c &&
                      'ring-2 ring-ink ring-offset-2 ring-offset-cream',
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid flex-1 grid-cols-[1fr_1fr] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded-lg border border-edge bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="+91 …"
          className="rounded-lg border border-edge bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="rounded-lg p-2 text-ink-faint transition hover:bg-cream hover:text-terracotta"
          aria-label={`Remove ${person.name || 'person'}`}
        >
          ✕
        </button>
      )}
    </div>
  )
}

function HouseholdNameInput({
  initial,
  onSync,
}: {
  initial: string
  onSync: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  useDebouncedSync(value, onSync)
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="e.g. Kaul household"
      className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
    />
  )
}
