import { useEffect, useRef } from 'react'

/**
 * Fire `onSync(value)` once `value` has been stable for `delay` ms.
 * Tracks what was last successfully synced so we don't refire after a
 * server push that simply confirmed our own update.
 *
 * Use alongside local input state to prevent mid-typing snap-backs:
 *   const [name, setName] = useState(person.name)
 *   useDebouncedSync(name, (v) => onUpdate({ name: v }))
 */
export function useDebouncedSync<T>(
  value: T,
  onSync: (value: T) => void,
  delay = 400,
) {
  const lastSynced = useRef<T>(value)

  useEffect(() => {
    if (value === lastSynced.current) return
    const handle = setTimeout(() => {
      onSync(value)
      lastSynced.current = value
    }, delay)
    return () => clearTimeout(handle)
  }, [value, onSync, delay])
}
