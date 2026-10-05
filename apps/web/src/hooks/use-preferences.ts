import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useLanguage } from "@/context/language-context"
import { api } from "@/lib/api"
import { showMutationErrorToast } from "@/lib/error-toast"
import { showPreferenceToast } from "@/lib/push-toast"
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

/**
 * Feedback shared by every preference mutation. Call sites may add their own
 * `onSuccess` (e.g. the push-enable prompt), which replaces this success toast.
 */
function usePreferenceMutationFeedback(action: "add" | "remove") {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  return {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY })
      showPreferenceToast(t(`preferences.${action}_success`))
    },
    onError: (error: Error) =>
      showMutationErrorToast(error, t(`preferences.${action}_error`)),
  }
}

/** Like the preference feedback, minus the success toast: the dialog list is the feedback. */
function useExclusionMutationFeedback(action: "add" | "remove") {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  return {
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY }),
    onError: (error: Error) =>
      showMutationErrorToast(error, t(`exclusions.${action}_error`)),
  }
}

export function useAddChannelPreference() {
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
    ...usePreferenceMutationFeedback("add"),
  })
}

export function useRemoveChannelPreference() {
  return useSessionAwareMutation({
    mutationFn: (id: string) => api.delete(`/preferences/channel/${id}`),
    ...usePreferenceMutationFeedback("remove"),
  })
}

export function useAddGlobalPreference() {
  return useSessionAwareMutation({
    mutationFn: (category: Category) =>
      api.post("/preferences/global", {
        category_id: category.id,
        category_name: category.name,
      }),
    ...usePreferenceMutationFeedback("add"),
  })
}

export function useRemoveGlobalPreference() {
  return useSessionAwareMutation({
    mutationFn: (id: string) => api.delete(`/preferences/global/${id}`),
    ...usePreferenceMutationFeedback("remove"),
  })
}

export function useAddGlobalPreferenceExclusion() {
  return useSessionAwareMutation({
    mutationFn: ({
      preferenceId,
      broadcasterUserId,
    }: {
      preferenceId: string
      broadcasterUserId: string
    }) =>
      api.post(`/preferences/global/${preferenceId}/exclusions`, {
        broadcaster_user_id: broadcasterUserId,
      }),
    ...useExclusionMutationFeedback("add"),
  })
}

export function useRemoveGlobalPreferenceExclusion() {
  return useSessionAwareMutation({
    mutationFn: ({
      preferenceId,
      exclusionId,
    }: {
      preferenceId: string
      exclusionId: string
    }) =>
      api.delete(
        `/preferences/global/${preferenceId}/exclusions/${exclusionId}`,
      ),
    ...useExclusionMutationFeedback("remove"),
  })
}
