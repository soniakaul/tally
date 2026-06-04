import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  Country,
  CountryInsert,
  CountryUpdate,
} from '../state/country'
import { useCurrentHousehold } from './useCurrentHousehold'

export function useCountries() {
  const queryClient = useQueryClient()
  const { householdId } = useCurrentHousehold()

  const query = useQuery({
    queryKey: ['countries', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Country[]> => {
      const { data, error } = await supabase
        .from('countries')
        .select('*')
        .eq('household_id', householdId!)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['countries', householdId] })
    queryClient.invalidateQueries({ queryKey: ['trash', householdId] })
  }

  const add = useMutation({
    mutationFn: async (country: Omit<CountryInsert, 'household_id'>) => {
      const { data, error } = await supabase
        .from('countries')
        .insert({ ...country, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: CountryUpdate }) => {
      const { data, error } = await supabase
        .from('countries')
        .update(args.patch)
        .eq('household_id', householdId!)
        .eq('id', args.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  // Soft delete.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('countries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('countries')
        .update({ deleted_at: null })
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Hard delete from Trash. Two guards:
  //   1. Only deletes rows that are already soft-deleted (deleted_at != null).
  //   2. Refuses if ANY item (live OR trashed) still references this country.
  //      The items→countries FK is ON DELETE CASCADE, so deleting the country
  //      would silently cascade-kill those items. Force the user to purge
  //      the items first.
  const purge = useMutation({
    mutationFn: async (id: string) => {
      // Safety: any items still pointing here? (live or trashed)
      const { count, error: countErr } = await supabase
        .from('items')
        .select('id', { head: true, count: 'exact' })
        .eq('household_id', householdId!)
        .eq('country_id', id)
      if (countErr) throw countErr
      if ((count ?? 0) > 0) {
        throw new Error(
          `Can't delete this country — ${count} item${count === 1 ? '' : 's'} still reference it. Delete those items first.`,
        )
      }
      const { error } = await supabase
        .from('countries')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
        .not('deleted_at', 'is', null)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    countries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: add.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    restore: restore.mutateAsync,
    purge: purge.mutateAsync,
  }
}
