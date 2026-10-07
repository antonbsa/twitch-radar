import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { useLanguage } from "@/context/language-context"
import { api } from "@/lib/api"
import { showMutationErrorToast } from "@/lib/error-toast"
import { interpolateNodes } from "@/lib/i18n-react"
import { showPreferenceToast } from "@/lib/push-toast"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import type {
  Category,
  GlobalPreferenceExclusion,
  PreferencesResponse,
} from "@/types/preference"

const PREFERENCES_QUERY_KEY = ["preferences"]

export function usePreferences() {
  return useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: () => api.get<{ data: PreferencesResponse }>("/preferences"),
    select: (res) => res.data,
  })
}

/** What a preference toast names; a null channel means a global alert. */
interface PreferenceToastTarget {
  channelName: string | null
  categoryName: string
}

/**
 * Feedback shared by every preference mutation. Call sites may add their own
 * `onSuccess` (e.g. the push-enable prompt), which replaces this success toast.
 */
function usePreferenceMutationFeedback<TVariables>(
  action: "add" | "remove",
  toastTarget: (variables: TVariables) => PreferenceToastTarget,
) {
  const queryClient = useQueryClient()
  const { t, tRaw } = useLanguage()

  return {
    onSuccess: async (_data: unknown, variables: TVariables) => {
      await queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY })
      const { channelName, categoryName } = toastTarget(variables)
      showPreferenceToast(
        interpolateNodes(tRaw(`preferences.${action}_success`), {
          target: (
            <strong>{channelName ?? t("preferences.all_channels")}</strong>
          ),
          category: <strong>{categoryName}</strong>,
        }),
      )
    },
    onError: (error: Error) =>
      showMutationErrorToast(error, t(`preferences.${action}_error`)),
  }
}

const EXCLUSION_MUTATION_KEY = ["global-exclusion"]
const OPTIMISTIC_EXCLUSION_PREFIX = "optimistic-"

/** True for an exclusion row shown before the API confirmed it (no real id yet). */
export function isOptimisticExclusion(exclusionId: string): boolean {
  return exclusionId.startsWith(OPTIMISTIC_EXCLUSION_PREFIX)
}

type CachedPreferences = { data: PreferencesResponse }

/**
 * Optimistic feedback for exclusion add/remove: the dialog list updates on
 * click, there is no success toast, and the cache is refetched once the last
 * in-flight exclusion mutation settles. On failure the refetch also reverts
 * the optimistic change, so no snapshot is kept that could clobber a
 * concurrent click.
 */
function useExclusionMutationFeedback(action: "add" | "remove") {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  return {
    mutationKey: EXCLUSION_MUTATION_KEY,
    onError: (error: Error) =>
      showMutationErrorToast(error, t(`exclusions.${action}_error`)),
    onSettled: () => {
      // This mutation still counts as in flight inside onSettled.
      if (queryClient.isMutating({ mutationKey: EXCLUSION_MUTATION_KEY }) > 1) {
        return
      }
      return queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY })
    },
  }
}

/** Rewrites one global preference's exclusions in the cached preferences. */
async function updateCachedExclusions(
  queryClient: QueryClient,
  preferenceId: string,
  update: (
    exclusions: GlobalPreferenceExclusion[],
  ) => GlobalPreferenceExclusion[],
) {
  await queryClient.cancelQueries({ queryKey: PREFERENCES_QUERY_KEY })
  queryClient.setQueryData<CachedPreferences>(
    PREFERENCES_QUERY_KEY,
    (old) =>
      old && {
        data: {
          ...old.data,
          global: old.data.global.map((pref) =>
            pref.id === preferenceId
              ? { ...pref, exclusions: update(pref.exclusions) }
              : pref,
          ),
        },
      },
  )
}

/** A preference to delete, plus the category name its toast shows. */
interface PreferenceRemoval {
  id: string
  categoryName: string
}

export function useAddChannelPreference() {
  return useSessionAwareMutation({
    mutationFn: ({
      broadcasterUserId,
      category,
    }: {
      broadcasterUserId: string
      channelName: string
      category: Category
    }) =>
      api.post("/preferences/channel", {
        broadcaster_user_id: broadcasterUserId,
        category_id: category.id,
        category_name: category.name,
      }),
    ...usePreferenceMutationFeedback(
      "add",
      ({
        channelName,
        category,
      }: {
        channelName: string
        category: Category
      }) => ({
        channelName,
        categoryName: category.name,
      }),
    ),
  })
}

export function useRemoveChannelPreference() {
  return useSessionAwareMutation({
    mutationFn: ({ id }: PreferenceRemoval & { channelName: string }) =>
      api.delete(`/preferences/channel/${id}`),
    ...usePreferenceMutationFeedback(
      "remove",
      (removal: PreferenceRemoval & { channelName: string }) => removal,
    ),
  })
}

export function useAddGlobalPreference() {
  return useSessionAwareMutation({
    mutationFn: (category: Category) =>
      api.post("/preferences/global", {
        category_id: category.id,
        category_name: category.name,
      }),
    ...usePreferenceMutationFeedback("add", (category: Category) => ({
      channelName: null,
      categoryName: category.name,
    })),
  })
}

export function useRemoveGlobalPreference() {
  return useSessionAwareMutation({
    mutationFn: ({ id }: PreferenceRemoval) =>
      api.delete(`/preferences/global/${id}`),
    ...usePreferenceMutationFeedback(
      "remove",
      (removal: PreferenceRemoval) => ({
        channelName: null,
        categoryName: removal.categoryName,
      }),
    ),
  })
}

export function useAddGlobalPreferenceExclusion() {
  const queryClient = useQueryClient()

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
    onMutate: ({ preferenceId, broadcasterUserId }) =>
      updateCachedExclusions(queryClient, preferenceId, (exclusions) => [
        ...exclusions,
        {
          id: `${OPTIMISTIC_EXCLUSION_PREFIX}${broadcasterUserId}`,
          broadcaster_user_id: broadcasterUserId,
          created_at: new Date().toISOString(),
        },
      ]),
    ...useExclusionMutationFeedback("add"),
  })
}

export function useRemoveGlobalPreferenceExclusion() {
  const queryClient = useQueryClient()

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
    onMutate: ({ preferenceId, exclusionId }) =>
      updateCachedExclusions(queryClient, preferenceId, (exclusions) =>
        exclusions.filter((e) => e.id !== exclusionId),
      ),
    ...useExclusionMutationFeedback("remove"),
  })
}
