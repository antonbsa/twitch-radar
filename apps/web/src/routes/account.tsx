import { useState } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"

export function AccountPage() {
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const navigate = useNavigate()

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
      navigate("/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Account</h1>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
          {user?.twitch_display_name?.[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{user?.twitch_display_name}</p>
          <p className="text-xs text-muted-foreground">Connected ✓</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium">Notifications</p>
        <p className="text-sm text-muted-foreground">
          Permission flow implemented in T-005.
        </p>
      </div>

      <Button
        variant="outline"
        className="mt-6 w-full"
        disabled={isLoggingOut}
        onClick={handleLogout}
      >
        Log Out
      </Button>
    </div>
  )
}
