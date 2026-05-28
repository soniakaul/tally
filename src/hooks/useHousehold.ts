import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Household, HouseholdUpdate } from '../state/household'
import { useCurrentHousehold } from './useCurrentHousehold'

export function useHousehold() {
  const queryClient = useQueryClient()
  const { householdId, isLoading: profileLoading } = useCurrentHousehold()

  const query = useQuery({
    queryKey: ['household', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Household> => {
      const { data, error } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const update = useMutation({
    mutationFn: async (patch: HouseholdUpdate) => {
      const { data, error } = await supabase
        .from('households')
        .update(patch)
        .eq('id', householdId!)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['household', householdId], data)
    },
  })

  return {
    household: query.data ?? null,
    isLoading: profileLoading || query.isLoading,
    error: query.error,
    update: update.mutateAsync,
  }
}
