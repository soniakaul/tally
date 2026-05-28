import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/auth'

export type Profile = {
  user_id: string
  household_id: string
  username: string
  email: string
}

export function useCurrentHousehold() {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['profile', user?.id ?? 'none'],
    enabled: !!user,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, household_id, username, email')
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data as Profile
    },
  })
  return {
    profile: q.data ?? null,
    householdId: q.data?.household_id ?? null,
    isLoading: q.isLoading,
    error: q.error,
  }
}
