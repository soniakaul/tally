import type { Database } from '../lib/database.types'

// App-level Payment type is the DB row exactly.
export type Payment = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']
export type PaymentUpdate = Database['public']['Tables']['payments']['Update']

export type Recurrence = Payment['recurrence']
export type Status = Payment['status']
export type Direction = Payment['direction']
// 'both' is a special marker; any other string is a person id from the household
export type PaymentPerson = 'both' | string
