import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { FOLLOWED_CHANNELS_QUERY_KEY } from "@/hooks/use-channels"

export interface SandboxEventInput {
  type: "go_live" | "switch_category"
  broadcasterUserId: string
  categoryId: string
}

export interface SandboxEventResult {
  change_type: string | null
  notified: boolean
}

export function useSandboxEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SandboxEventInput) =>
      api.post<{ data: SandboxEventResult }>("/__sandbox__/events", input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: FOLLOWED_CHANNELS_QUERY_KEY }),
  })
}
