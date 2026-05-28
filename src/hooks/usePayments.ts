import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  Payment,
  PaymentInsert,
  PaymentUpdate,
} from '../state/payments'
import { bumpDueDate, computeStatus } from '../lib/utils'
import { useCurrentHousehold } from './useCurrentHousehold'

const TODAY = () => new Date()

export function usePayments() {
  const queryClient = useQueryClient()
  const { householdId } = useCurrentHousehold()
  const key = ['payments', householdId] as const

  const query = useQuery({
    queryKey: key,
    enabled: !!householdId,
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('household_id', householdId!)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  const add = useMutation({
    mutationFn: async (p: Omit<PaymentInsert, 'household_id'>) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({ ...p, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: PaymentUpdate }) => {
      const { data, error } = await supabase
        .from('payments')
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
        .from('payments')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Optimistic toggle paid — flip the row immediately, then sync to DB.
  // If recurring and not past end_date, also creates the next instance.
  const togglePaid = useMutation({
    mutationFn: async (payment: Payment) => {
      const today = TODAY()
      if (payment.status === 'paid') {
        const nextStatus = computeStatus(payment.due_date, today)
        const { error } = await supabase
          .from('payments')
          .update({
            status: nextStatus,
            paid_at: null,
            paid_via: null,
          })
          .eq('household_id', householdId!)
          .eq('id', payment.id)
        if (error) throw error
        return
      }

      const { error: markErr } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_at: today.toISOString(),
          paid_via: 'portal',
        })
        .eq('household_id', householdId!)
        .eq('id', payment.id)
      if (markErr) throw markErr

      if (payment.recurrence !== 'one-off') {
        const nextDate = bumpDueDate(payment.due_date, payment.recurrence)
        const pastEnd = payment.end_date && nextDate > payment.end_date
        if (!pastEnd) {
          const { error: insErr } = await supabase
            .from('payments')
            .insert({
              household_id: householdId!,
              category_id: payment.category_id,
              person: payment.person,
              name: payment.name,
              amount: payment.amount,
              currency: payment.currency,
              due_date: nextDate,
              recurrence: payment.recurrence,
              end_date: payment.end_date,
              status: computeStatus(nextDate, today),
            })
          if (insErr) throw insErr
        }
      }
    },
    onMutate: async (payment) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Payment[]>(key)
      const today = TODAY()
      queryClient.setQueryData<Payment[]>(key, (old = []) =>
        old.map((p) =>
          p.id === payment.id
            ? {
                ...p,
                status:
                  p.status === 'paid'
                    ? computeStatus(p.due_date, today)
                    : 'paid',
                paid_at:
                  p.status === 'paid' ? null : today.toISOString(),
                paid_via: p.status === 'paid' ? null : 'portal',
              }
            : p,
        ),
      )
      return { previous }
    },
    onError: (_err, _payment, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: invalidate,
  })

  return {
    payments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: add.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    togglePaid: togglePaid.mutate,
  }
}
