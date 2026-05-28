import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  Category,
  CategoryInsert,
  CategoryUpdate,
} from '../state/categories'
import { useCurrentHousehold } from './useCurrentHousehold'

export function useCategories() {
  const queryClient = useQueryClient()
  const { householdId } = useCurrentHousehold()

  const query = useQuery({
    queryKey: ['categories', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('household_id', householdId!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['categories', householdId] })

  const add = useMutation({
    mutationFn: async (cat: Omit<CategoryInsert, 'household_id'>) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ ...cat, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: CategoryUpdate }) => {
      const { data, error } = await supabase
        .from('categories')
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
        .from('categories')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: add.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
  }
}
