import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  ReminderRule,
  ReminderRuleInsert,
  ReminderRuleUpdate,
} from '../state/settings'
import { useCurrentHousehold } from './useCurrentHousehold'

export function useReminders() {
  const queryClient = useQueryClient()
  const { householdId } = useCurrentHousehold()
  const key = ['reminders', householdId] as const

  const query = useQuery({
    queryKey: key,
    enabled: !!householdId,
    queryFn: async (): Promise<ReminderRule[]> => {
      const { data, error } = await supabase
        .from('reminder_rules')
        .select('*')
        .eq('household_id', householdId!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  const add = useMutation({
    mutationFn: async (rule: Omit<ReminderRuleInsert, 'household_id'>) => {
      const { data, error } = await supabase
        .from('reminder_rules')
        .insert({ ...rule, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: ReminderRuleUpdate }) => {
      const { data, error } = await supabase
        .from('reminder_rules')
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
        .from('reminder_rules')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    reminders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: add.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
  }
}
