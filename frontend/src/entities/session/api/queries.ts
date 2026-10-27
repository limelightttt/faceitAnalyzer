import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPost, apiPut, setCsrfToken } from '@/shared/api/client'

import type { Session, UserSettings } from '../model/types'

export const useSession = () =>
  useQuery({
    queryKey: ['session'],
    queryFn: async ({ signal }) => {
      const s = await apiGet<Session>('/auth/me', signal)
      setCsrfToken(s.csrf_token ?? null)
      return s
    },
    staleTime: 60_000,
  })

export const useLogout = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost('/auth/logout'),
    onSuccess: () => {
      setCsrfToken(null)
      qc.clear()
      window.location.assign('/')
    },
  })
}

export const useSettings = (enabled: boolean) =>
  useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => apiGet<UserSettings>('/me/settings', signal), enabled })

export const useSaveSettings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: UserSettings) => apiPut<UserSettings>('/me/settings', s),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  })
}

export const useHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ['me-history'],
    queryFn: ({ signal }) => apiGet<{ kind: string; ref: string; label: string; at: string }[]>('/me/history', signal),
    enabled,
  })

export const loginUrl = (provider: 'steam' | 'faceit', returnTo = window.location.pathname, link = false) =>
  `/api/auth/${provider}/start?return_to=${encodeURIComponent(returnTo)}${link ? '&link=true' : ''}`
