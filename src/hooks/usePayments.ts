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

export type DeleteScope = 'one' | 'future' | 'all'

// Series identity: payments with the same (name, item_id, recurrence) belong
// to the same recurring chain. Used to dedup auto-created next instances and
// to drive the scoped-delete options.
function applySeriesMatch<T extends { eq: any; is: any }>(
  q: T,
  payment: Pick<Payment, 'name' | 'item_id' | 'recurrence'>,
): T {
  let r = q.eq('name', payment.name).eq('recurrence', payment.recurrence)
  r = payment.item_id === null ? r.is('item_id', null) : r.eq('item_id', payment.item_id)
  return r
}

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

  // Scoped delete for recurring payments.
  //   one    — just this row
  //   future — this row + all rows in the same series with due_date >= this
  //   all    — every row in the same series, paid history included
  const removeScoped = useMutation({
    mutationFn: async ({
      payment,
      scope,
    }: {
      payment: Payment
      scope: DeleteScope
    }) => {
      if (scope === 'one' || payment.recurrence === 'one-off') {
        const { error } = await supabase
          .from('payments')
          .delete()
          .eq('household_id', householdId!)
          .eq('id', payment.id)
        if (error) throw error
        return
      }

      let q = supabase
        .from('payments')
        .delete()
        .eq('household_id', householdId!)
      q = applySeriesMatch(q, payment)
      if (scope === 'future') {
        q = q.gte('due_date', payment.due_date)
      }
      const { error } = await q
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Optimistic toggle paid — flip the row immediately, then sync to DB.
  // For recurring rows, also creates the next instance, BUT skips if one
  // already exists in the same series at the next due date (prevents
  // duplicates when the user toggles paid → unpaid → paid).
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
          let dedupQ = supabase
            .from('payments')
            .select('id')
            .eq('household_id', householdId!)
            .eq('due_date', nextDate)
          dedupQ = applySeriesMatch(dedupQ, payment)
          const { data: existing, error: dedupErr } = await dedupQ.limit(1)
          if (dedupErr) throw dedupErr

          if (!existing || existing.length === 0) {
            const { error: insErr } = await supabase
              .from('payments')
              .insert({
                household_id: householdId!,
                item_id: payment.item_id,
                person: payment.person,
                name: payment.name,
                amount: payment.amount,
                currency: payment.currency,
                direction: payment.direction,
                due_date: nextDate,
                recurrence: payment.recurrence,
                end_date: payment.end_date,
                status: computeStatus(nextDate, today),
              })
            if (insErr) throw insErr
          }
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
    removeScoped: removeScoped.mutateAsync,
    togglePaid: togglePaid.mutate,
  }
}
