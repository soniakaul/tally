import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Person, PersonInsert, PersonUpdate } from '../state/household'
import { useCurrentHousehold } from './useCurrentHousehold'

export function usePeople() {
  const queryClient = useQueryClient()
  const { householdId } = useCurrentHousehold()

  const query = useQuery({
    queryKey: ['people', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('household_id', householdId!)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['people', householdId] })
    queryClient.invalidateQueries({ queryKey: ['trash', householdId] })
  }

  const add = useMutation({
    mutationFn: async (person: Omit<PersonInsert, 'household_id'>) => {
      const { data, error } = await supabase
        .from('people')
        .insert({ ...person, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: PersonUpdate }) => {
      const { data, error } = await supabase
        .from('people')
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
        .from('people')
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
        .from('people')
        .update({ deleted_at: null })
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Hard delete from Trash. payments.person is plain text, so no cascade
  // risk — orphaned references just display as "—" in the For column.
  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('people')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
        .not('deleted_at', 'is', null)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    people: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: add.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    restore: restore.mutateAsync,
    purge: purge.mutateAsync,
  }
}
