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
        .is('deleted_at', null)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key })
    // Trash view also depends on these rows; keep both fresh.
    queryClient.invalidateQueries({ queryKey: ['trash', householdId] })
  }

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

  // Soft delete: flip deleted_at = now() instead of DELETE. The row stays in
  // the DB and surfaces in Trash, where it can be restored.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Scoped soft delete for recurring payments.
  //   one    — just this row
  //   future — this row + all live rows in the same series with due_date >= this
  //   all    — every live row in the same series
  const removeScoped = useMutation({
    mutationFn: async ({
      payment,
      scope,
    }: {
      payment: Payment
      scope: DeleteScope
    }) => {
      const now = new Date().toISOString()
      if (scope === 'one' || payment.recurrence === 'one-off') {
        const { error } = await supabase
          .from('payments')
          .update({ deleted_at: now })
          .eq('household_id', householdId!)
          .eq('id', payment.id)
        if (error) throw error
        return
      }

      let q = supabase
        .from('payments')
        .update({ deleted_at: now })
        .eq('household_id', householdId!)
        .is('deleted_at', null)
      q = applySeriesMatch(q, payment)
      if (scope === 'future') {
        q = q.gte('due_date', payment.due_date)
      }
      const { error } = await q
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Series-aware update. Mirrors removeScoped for edits.
  //   one    — just this row, full patch (incl. due_date)
  //   future — this row + live siblings with due_date >= this; only the
  //            series-level fields are propagated (due_date / end_date /
  //            status / paid markers are skipped so each instance keeps
  //            its own date)
  //   all    — all live siblings; same field filter as 'future'
  const updateScoped = useMutation({
    mutationFn: async (args: {
      payment: Payment
      patch: PaymentUpdate
      scope: DeleteScope
    }) => {
      const { payment, patch, scope } = args
      if (scope === 'one' || payment.recurrence === 'one-off') {
        const { error } = await supabase
          .from('payments')
          .update(patch)
          .eq('household_id', householdId!)
          .eq('id', payment.id)
        if (error) throw error
        return
      }

      // Strip instance-specific fields before propagating to siblings.
      const seriesPatch: PaymentUpdate = { ...patch }
      delete seriesPatch.due_date
      delete seriesPatch.end_date
      delete seriesPatch.status
      delete seriesPatch.paid_at
      delete seriesPatch.paid_via

      let q = supabase
        .from('payments')
        .update(seriesPatch)
        .eq('household_id', householdId!)
        .is('deleted_at', null)
      q = applySeriesMatch(q, payment)
      if (scope === 'future') {
        q = q.gte('due_date', payment.due_date)
      }
      const { error } = await q
      if (error) throw error

      // If "all" / "future" was chosen we still want this exact row to get
      // its instance-specific fields too (e.g. she also changed due_date on
      // this instance). Re-apply the original full patch to it.
      const { error: thisErr } = await supabase
        .from('payments')
        .update(patch)
        .eq('household_id', householdId!)
        .eq('id', payment.id)
      if (thisErr) throw thisErr
    },
    onSuccess: invalidate,
  })

  // Inverse of remove — clears deleted_at so the row reappears in the live set.
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .update({ deleted_at: null })
        .eq('household_id', householdId!)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Hard delete from Trash. Guarded so we only ever hard-delete rows that
  // are ALREADY soft-deleted (deleted_at IS NOT NULL) — protects against
  // accidental misuse that would skip the trash safety net.
  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('household_id', householdId!)
        .eq('id', id)
        .not('deleted_at', 'is', null)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Optimistic toggle paid — flip the row immediately, then sync to DB.
  // For recurring rows, also creates the next instance, BUT skips if one
  // already exists (live) in the same series at the next due date (prevents
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
            .is('deleted_at', null)
          dedupQ = applySeriesMatch(dedupQ, payment)
          const { data: existing, error: dedupErr } = await dedupQ.limit(1)
          if (dedupErr) throw dedupErr

          if (!existing || existing.length === 0) {
            // Server-side clone so the new row inherits ALL fields, including
            // the credential ciphertext columns that aren't exposed to the
            // JS client. See migration 009.
            const { error: cloneErr } = await supabase.rpc(
              'clone_payment_next_recurrence',
              {
                source_payment_id: payment.id,
                next_due_date: nextDate,
                next_status: computeStatus(nextDate, today),
              },
            )
            if (cloneErr) throw cloneErr
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
    updateScoped: updateScoped.mutateAsync,
    restore: restore.mutateAsync,
    purge: purge.mutateAsync,
    togglePaid: togglePaid.mutate,
  }
}
