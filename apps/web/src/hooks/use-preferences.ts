import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import type { Category, PreferencesResponse } from "@/types/preference"

const PREFERENCES_QUERY_KEY = ["preferences"]

export function usePreferences() {
  return useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: () => api.get<{ data: PreferencesResponse }>("/preferences"),
    select: (res) => res.data,
  })
}

export function useAddChannelPreference() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: ({
      broadcasterUserId,
      category,
    }: {
      broadcasterUserId: string
      category: Category
    }) =>
      api.post("/preferences/channel", {
        broadcaster_user_id: broadcasterUserId,
        category_id: category.id,
        category_name: category.name,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY }),
  })
}

export function useRemoveChannelPreference() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: (id: string) => api.delete(`/preferences/channel/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY }),
  })
}

export function useAddGlobalPreference() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: (category: Category) =>
      api.post("/preferences/global", {
        category_id: category.id,
        category_name: category.name,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY }),
  })
}

export function useRemoveGlobalPreference() {
  const queryClient = useQueryClient()

  return useSessionAwareMutation({
    mutationFn: (id: string) => api.delete(`/preferences/global/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY }),
  })
}
