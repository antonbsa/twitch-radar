import { useState } from "react"
import { useNavigate } from "react-router"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import { useSyncFollows } from "@/hooks/use-channels"
import {
  usePushNotifications,
  type PushStatus,
} from "@/hooks/use-push-notifications"

function notificationStatusLabel(status: PushStatus): string {
  switch (status) {
    case "checking":
      return "Checking…"
    case "enabled":
      return "Enabled"
    case "denied":
      return "Denied"
    case "unsupported":
      return "Not supported"
    default:
      return "Not enabled"
  }
}

export function AccountPage() {
  const { user, reconnectRequired, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const push = usePushNotifications()
  const navigate = useNavigate()
  const syncFollows = useSyncFollows()

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
        <Avatar size="lg">
          <AvatarFallback>
            {user?.twitch_display_name?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{user?.twitch_display_name}</p>
          <p className="text-xs text-muted-foreground">Connected ✓</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium">Notifications</p>
        <p className="text-sm text-muted-foreground">
          Status: {notificationStatusLabel(push.status)}
        </p>
        {push.status === "not-enabled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={push.isPending}
            onClick={push.enable}
          >
            Enable Notifications
          </Button>
        )}
        {push.status === "enabled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={push.isPending}
            onClick={push.disable}
          >
            Disable on this device
          </Button>
        )}
        {push.status === "denied" && (
          <p className="text-xs text-muted-foreground">
            Go to browser settings to enable.
          </p>
        )}
        {push.error && <p className="text-xs text-destructive">{push.error}</p>}
      </div>

      <Button
        variant="outline"
        className="mt-6 w-full"
        disabled={syncFollows.isPending}
        onClick={() => syncFollows.mutate()}
      >
        Sync Channels
      </Button>

      {reconnectRequired && (
        <Button className="mt-3 w-full" asChild>
          <a href="/api/auth/twitch/start">Reconnect Twitch</a>
        </Button>
      )}

      <Button
        variant="outline"
        className="mt-3 w-full"
        disabled={isLoggingOut}
        onClick={handleLogout}
      >
        Log Out
      </Button>
    </div>
  )
}
