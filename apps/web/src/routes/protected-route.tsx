import type { ReactNode } from "react"
import { Navigate } from "react-router"
import { useAuth } from "@/context/auth-context"
import { FullScreenLoader } from "@/components/full-screen-loader"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <FullScreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <>{children}</>
}
