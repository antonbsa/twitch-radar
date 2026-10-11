import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/api"

export const SANDBOX_PERSONAS = ["full", "empty", "reconnect"] as const
export type SandboxPersona = (typeof SANDBOX_PERSONAS)[number]

/** Not session-aware: a 401 here is not a lapsed session, there is none yet. */
export function useSandboxLogin() {
  return useMutation({
    mutationFn: (persona: SandboxPersona) =>
      api.post("/__sandbox__/login", { persona }),
  })
}
