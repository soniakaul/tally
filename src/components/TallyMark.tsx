type Props = {
  size?: number
  strokeWidth?: number
  className?: string
}

export function TallyMark({ size = 20, strokeWidth = 2.2, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="6" y1="5" x2="6" y2="19" />
      <line x1="10" y1="5" x2="10" y2="19" />
      <line x1="14" y1="5" x2="14" y2="19" />
      <line x1="18" y1="5" x2="18" y2="19" />
      <line x1="3.5" y1="19.5" x2="20.5" y2="4.5" />
    </svg>
  )
}
