import { cn } from '../lib/utils'
import { colorBgClass } from '../state/colors'
import { initialOf, type PersonColor } from '../state/household'

export function PersonAvatar({
  name,
  color,
  size = 'sm',
  className,
}: {
  name: string
  color: PersonColor
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClass =
    size === 'lg'
      ? 'h-9 w-9 text-sm'
      : size === 'md'
        ? 'h-7 w-7 text-xs'
        : 'h-6 w-6 text-[10px]'
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-semibold text-cream',
        colorBgClass[color],
        sizeClass,
        className,
      )}
      aria-label={name}
    >
      {initialOf(name)}
    </div>
  )
}
