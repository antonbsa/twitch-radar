import { useCallback, useEffect, useRef } from "react"
import {
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationStatus,
} from "@tanstack/react-query"
import { useAuth } from "@/context/auth-context"
import { api } from "@/lib/api"
import { useSessionAwareMutation } from "@/hooks/use-session-aware-mutation"
import type { FollowedChannel } from "@/types/channel"

const FOLLOWED_CHANNELS_QUERY_KEY = ["followed-channels"]
const SYNC_FOLLOWS_MUTATION_KEY = ["sync-follows"]
const AUTO_SYNC_FOLLOWS_MUTATION_KEY = [...SYNC_FOLLOWS_MUTATION_KEY, "auto"]

// One threshold for both the on-load and the on-resume check (issue #88).
const FOLLOW_SYNC_STALE_MS = 30 * 60 * 1000

export function isFollowSyncStale(lastFollowSyncAt: string | null): boolean {
  return (
    !lastFollowSyncAt ||
    Date.now() - Date.parse(lastFollowSyncAt) > FOLLOW_SYNC_STALE_MS
  )
}

export function useFollowedChannels() {
  return useQuery({
    queryKey: FOLLOWED_CHANNELS_QUERY_KEY,
    queryFn: () => api.get<{ data: FollowedChannel[] }>("/channels/followed"),
    select: (res) => res.data,
  })
}

function useSyncFollowsMutation(mutationKey: readonly string[]) {
  const queryClient = useQueryClient()
  const { markFollowsSynced } = useAuth()

  return useSessionAwareMutation({
    mutationKey,
    mutationFn: () => api.post<{ data: FollowedChannel[] }>("/sync/follows"),
    onSuccess: async (res) => {
      // A GET still in flight (initial load, refetch on focus) would land
      // after this and overwrite the fresh Twitch data with D1 rows the
      // deferred sync write hasn't updated yet.
      await queryClient.cancelQueries({
        queryKey: FOLLOWED_CHANNELS_QUERY_KEY,
      })
      queryClient.setQueryData(FOLLOWED_CHANNELS_QUERY_KEY, res)
      markFollowsSynced(new Date().toISOString())
    },
  })
}

/** Manual sync; call sites own any user feedback (toasts) via `mutate` options. */
export function useSyncFollows() {
  return useSyncFollowsMutation(SYNC_FOLLOWS_MUTATION_KEY)
}

/**
 * Silently syncs follows when `last_follow_sync_at` is missing or stale: on
 * mount (login / app load) and whenever the app comes back to the
 * foreground (issue #88). Mount once, in the authenticated layout.
 */
export function useAutoSyncFollows() {
  const { user, reconnectRequired } = useAuth()
  const { mutate } = useSyncFollowsMutation(AUTO_SYNC_FOLLOWS_MUTATION_KEY)
  // visibilitychange and focus usually fire together on resume, and
  // StrictMode re-runs the mount effect: a render-time isPending is still
  // false for the second call, so guard synchronously.
  const inFlightRef = useRef(false)

  const lastFollowSyncAt = user?.last_follow_sync_at ?? null

  const syncIfStale = useCallback(() => {
    if (inFlightRef.current || reconnectRequired) return
    if (!isFollowSyncStale(lastFollowSyncAt)) return
    inFlightRef.current = true
    mutate(undefined, {
      onSettled: () => {
        inFlightRef.current = false
      },
    })
  }, [lastFollowSyncAt, reconnectRequired, mutate])

  // Re-running on a dependency change re-checks too, which is a no-op in
  // practice: a sync freshens the timestamp, a 401 sets reconnectRequired.
  useEffect(() => {
    syncIfStale()
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncIfStale()
    }
    const onFocus = () => syncIfStale()
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
    }
  }, [syncIfStale])
}

/** Status of the latest `useAutoSyncFollows` run, or undefined if none ran. */
export function useAutoSyncFollowsStatus(): MutationStatus | undefined {
  return useMutationState({
    filters: { mutationKey: AUTO_SYNC_FOLLOWS_MUTATION_KEY },
    select: (mutation) => mutation.state.status,
  }).at(-1)
}
