import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { api } from "@/lib/api"
import { ApiRequestError } from "@/lib/errors"
import type { User } from "@/types/user"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  // Unified "user must reconnect via Twitch OAuth" signal (issue #37). True
  // when either the `/me` payload flags a dead refresh token
  // (user.twitch_reconnect_required) or a session-aware mutation hit a 401
  // (markReconnectRequired). Consumers should read this single value instead
  // of tracking the two triggers separately.
  reconnectRequired: boolean
  refetch: () => Promise<void>
  logout: () => Promise<void>
  markReconnectRequired: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Set by a session-aware mutation's onError (401). Cleared whenever a
  // fresh /me response comes in, since that response is the source of truth
  // for whether reconnecting is still required.
  const [mutationReconnectRequired, setMutationReconnectRequired] =
    useState(false)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get<{ data: User }>("/me")
      setUser(data)
      setMutationReconnectRequired(false)
    } catch (err) {
      if (
        import.meta.env.DEV &&
        !(err instanceof ApiRequestError && err.status === 401)
      ) {
        console.error("Failed to load session", err)
      }
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const logout = useCallback(async () => {
    await api.post("/auth/logout")
    setUser(null)
    setMutationReconnectRequired(false)
  }, [])

  const markReconnectRequired = useCallback(() => {
    setMutationReconnectRequired(true)
  }, [])

  const reconnectRequired = useMemo(
    () =>
      mutationReconnectRequired || (user?.twitch_reconnect_required ?? false),
    [mutationReconnectRequired, user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      reconnectRequired,
      refetch,
      logout,
      markReconnectRequired,
    }),
    [
      user,
      isLoading,
      reconnectRequired,
      refetch,
      logout,
      markReconnectRequired,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
