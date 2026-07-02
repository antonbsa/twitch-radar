import { useState } from "react"
import { useNavigate } from "react-router"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import { useSyncFollows } from "@/hooks/use-sync-follows"

type NotificationPermissionState = NotificationPermission | "unsupported"

function notificationStatusLabel(
  permission: NotificationPermissionState,
): string {
  switch (permission) {
    case "granted":
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
  const { user, isSessionExpired, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [permission, setPermission] = useState<NotificationPermissionState>(
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  )
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

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  function handleReconnect() {
    window.location.href = "/api/auth/twitch/start"
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
          Status: {notificationStatusLabel(permission)}
        </p>
        {permission === "default" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableNotifications}
          >
            Enable Notifications
          </Button>
        )}
        {permission === "denied" && (
          <p className="text-xs text-muted-foreground">
            Go to browser settings to enable.
          </p>
        )}
      </div>

      <Button
        variant="outline"
        className="mt-6 w-full"
        disabled={syncFollows.isPending}
        onClick={() => syncFollows.mutate()}
      >
        Sync Channels
      </Button>

      {isSessionExpired && (
        <Button className="mt-3 w-full" onClick={handleReconnect}>
          Reconnect Twitch
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
