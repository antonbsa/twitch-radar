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
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get<{ data: User }>("/me")
      setUser(data)
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) {
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

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isAuthenticated: user !== null, refetch }),
    [user, isLoading, refetch],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
