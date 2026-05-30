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
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['countries', householdId] })

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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('countries')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
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
  }
}
