import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Item, ItemInsert, ItemUpdate } from '../state/item'
import { useCurrentHousehold } from './useCurrentHousehold'

export function useItems() {
  const queryClient = useQueryClient()
  const { householdId } = useCurrentHousehold()

  const query = useQuery({
    queryKey: ['items', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('household_id', householdId!)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['items', householdId] })
    queryClient.invalidateQueries({ queryKey: ['trash', householdId] })
  }

  const add = useMutation({
    mutationFn: async (item: Omit<ItemInsert, 'household_id'>) => {
      const { data, error } = await supabase
        .from('items')
        .insert({ ...item, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: ItemUpdate }) => {
      const { data, error } = await supabase
        .from('items')
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

  // Soft delete — flips deleted_at instead of removing the row.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('items')
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
        .from('items')
        .update({ deleted_at: null })
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Hard delete from Trash. Guarded — refuses to delete live rows.
  // Payments referencing this item are unlinked via the FK ON DELETE SET NULL.
  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
        .not('deleted_at', 'is', null)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: add.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    restore: restore.mutateAsync,
    purge: purge.mutateAsync,
  }
}
