import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import {
  usePaymentCredentials,
  type CredentialScope,
  type PaymentCredentials,
} from '../hooks/usePaymentCredentials'

type Props = {
  paymentId: string
  paymentName: string
  // Hint from the parent so we know whether to even try fetching. If the
  // payment has no credentials yet, we open with empty fields instead of
  // showing a loading state.
  hasCredentials: boolean
  // Number of other live rows in the same series. If > 0, we show a scope
  // picker so a credential change can propagate. If 0, save is single-row.
  siblingCount?: number
  onClose: () => void
  onSaved?: () => void
}

const EMPTY: PaymentCredentials = {
  portal_username: null,
  portal_password: null,
  bank_username: null,
  bank_password: null,
}

// Tracks per-field state. Each field starts hidden; once revealed, plaintext
// is kept in local state until the dialog closes.
type FieldKey = keyof PaymentCredentials
const FIELDS: { key: FieldKey; label: string; secret: boolean }[] = [
  { key: 'portal_username', label: 'Portal username', secret: false },
  { key: 'portal_password', label: 'Portal password', secret: true },
  { key: 'bank_username', label: 'Bank username', secret: false },
  { key: 'bank_password', label: 'Bank password', secret: true },
]

export function CredentialsDialog({
  paymentId,
  paymentName,
  hasCredentials,
  siblingCount = 0,
  onClose,
  onSaved,
}: Props) {
  const { get, set, setting } = usePaymentCredentials()

  const [values, setValues] = useState<PaymentCredentials>(EMPTY)
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    portal_username: false,
    portal_password: false,
    bank_username: false,
    bank_password: false,
  })
  const [revealed, setRevealed] = useState<Record<FieldKey, boolean>>({
    portal_username: false,
    portal_password: false,
    bank_username: false,
    bank_password: false,
  })
  const [loaded, setLoaded] = useState(!hasCredentials)
  const [loading, setLoading] = useState(hasCredentials)
  const [error, setError] = useState<string | null>(null)
  // Default to 'all' when siblings exist — usually mom intends a series-wide
  // change ("the bank password changed"). She can downscope per-edit.
  const [scope, setScope] = useState<CredentialScope>(
    siblingCount > 0 ? 'all' : 'one',
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Initial fetch — only if the payment claims to have credentials. The
  // server still verifies ownership + rate limits; we just skip a wasted call.
  useEffect(() => {
    if (!hasCredentials || loaded) return
    let cancelled = false
    setLoading(true)
    setError(null)
    get(paymentId)
      .then((data) => {
        if (cancelled) return
        setValues(data)
        setLoaded(true)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        // Don't block editing: open with empty fields so user can still write.
        setValues(EMPTY)
        setLoaded(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paymentId, hasCredentials, loaded, get])

  const updateField = (key: FieldKey, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }))
    setTouched((prev) => ({ ...prev, [key]: true }))
  }
  const clearField = (key: FieldKey) => {
    setValues((prev) => ({ ...prev, [key]: '' }))
    setTouched((prev) => ({ ...prev, [key]: true }))
  }
  const toggleReveal = (key: FieldKey) =>
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleSave = async () => {
    const patch: Partial<PaymentCredentials> = {}
    for (const f of FIELDS) {
      if (!touched[f.key]) continue
      const v = values[f.key]
      patch[f.key] = v && v.length > 0 ? v : null
    }
    if (Object.keys(patch).length === 0) {
      // Nothing changed — just close.
      onClose()
      return
    }
    setError(null)
    try {
      await set({ paymentId, patch, scope })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const anyDirty = Object.values(touched).some(Boolean)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-cream shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-edge px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-ink">
              Credentials
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              For <span className="font-medium text-ink">{paymentName}</span>.
              Encrypted at rest. Never sent in WhatsApp reminders.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition hover:bg-card hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-terracotta/30 bg-terracotta-soft px-3 py-2 text-xs text-terracotta">
            {error}
          </div>
        )}

        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-ink-muted">
            Decrypting…
          </div>
        ) : (
          <div className="space-y-4 px-6 py-5">
            {FIELDS.map((f) => {
              const value = values[f.key] ?? ''
              const masked = f.secret && !revealed[f.key]
              return (
                <div key={f.key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      {f.label}
                    </label>
                    <div className="flex items-center gap-2 text-[10px]">
                      {f.secret && value && (
                        <button
                          type="button"
                          onClick={() => toggleReveal(f.key)}
                          className="font-medium text-ink-muted underline-offset-4 hover:underline"
                        >
                          {revealed[f.key] ? 'Hide' : 'Show'}
                        </button>
                      )}
                      {value && (
                        <button
                          type="button"
                          onClick={() => clearField(f.key)}
                          className="font-medium text-terracotta underline-offset-4 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type={masked ? 'password' : 'text'}
                    autoComplete="off"
                    value={value}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    placeholder={f.secret ? '••••••••' : 'username'}
                    className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                </div>
              )
            })}
            <p className="text-[11px] text-ink-faint">
              Decrypted values stay only in this window. Closing wipes them
              from memory. The next “Show” will re-fetch from the server.
            </p>
          </div>
        )}

        {siblingCount > 0 && (
          <div className="border-t border-edge bg-sage-soft/30 px-6 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-sage">
              Apply to which instances?
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {(
                [
                  { value: 'one', label: 'Just this one' },
                  { value: 'future', label: 'This and all future' },
                  {
                    value: 'all',
                    label: `All ${siblingCount + 1} instances`,
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 font-medium transition',
                    scope === opt.value
                      ? 'bg-sage text-cream'
                      : 'border border-edge bg-cream text-ink-muted hover:bg-card hover:text-ink',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-edge px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-full border border-edge bg-card/60 px-4 py-2 text-sm font-medium text-ink-muted hover:bg-card hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={setting || !anyDirty}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition',
              setting || !anyDirty
                ? 'cursor-not-allowed bg-edge text-ink-faint'
                : 'bg-ink text-cream hover:bg-ink-muted',
            )}
          >
            {setting ? 'Saving…' : 'Save credentials'}
          </button>
        </div>
      </div>
    </div>
  )
}
