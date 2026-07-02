import type { ReactNode } from "react"
import { Navigate } from "react-router"
import { useAuth } from "@/context/auth-context"
import { FullScreenLoader } from "@/components/full-screen-loader"

interface AuthGateProps {
  when: "authenticated" | "guest"
  redirectTo: string
  children: ReactNode
}

export function AuthGate({ when, redirectTo, children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <FullScreenLoader />

  const blocked = when === "authenticated" ? !isAuthenticated : isAuthenticated
  if (blocked) return <Navigate to={redirectTo} replace />

  return <>{children}</>
}
