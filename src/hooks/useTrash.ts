import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Payment } from '../state/payments'
import type { Item } from '../state/item'
import type { Country } from '../state/country'
import type { Person } from '../state/household'
import { useCurrentHousehold } from './useCurrentHousehold'

export type TrashContents = {
  payments: Payment[]
  items: Item[]
  countries: Country[]
  people: Person[]
}

// Returns rows where deleted_at IS NOT NULL across all soft-deleted entities,
// scoped to the current household. Trash UI reads from here; restore/purge
// mutations live on each entity's own hook.
export function useTrash() {
  const { householdId } = useCurrentHousehold()

  const query = useQuery({
    queryKey: ['trash', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<TrashContents> => {
      const hh = householdId!
      const [pRes, iRes, cRes, peopleRes] = await Promise.all([
        supabase
          .from('payments')
          .select('*')
          .eq('household_id', hh)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
        supabase
          .from('items')
          .select('*')
          .eq('household_id', hh)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
        supabase
          .from('countries')
          .select('*')
          .eq('household_id', hh)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
        supabase
          .from('people')
          .select('*')
          .eq('household_id', hh)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
      ])
      if (pRes.error) throw pRes.error
      if (iRes.error) throw iRes.error
      if (cRes.error) throw cRes.error
      if (peopleRes.error) throw peopleRes.error
      return {
        payments: pRes.data ?? [],
        items: iRes.data ?? [],
        countries: cRes.data ?? [],
        people: peopleRes.data ?? [],
      }
    },
  })

  const t = query.data
  const totalCount =
    (t?.payments.length ?? 0) +
    (t?.items.length ?? 0) +
    (t?.countries.length ?? 0) +
    (t?.people.length ?? 0)

  return {
    contents: t ?? { payments: [], items: [], countries: [], people: [] },
    totalCount,
    isLoading: query.isLoading,
    error: query.error,
  }
}
