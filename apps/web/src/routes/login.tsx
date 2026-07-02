import { Button } from "@/components/ui/button"

export function LoginPage() {
  function handleConnect() {
    window.location.href = "/api/auth/twitch/start"
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Twitch Radar</h1>
        <p className="text-sm text-muted-foreground">
          Get notified when channels you follow go live in the categories you
          care about.
        </p>
      </div>
      <Button size="lg" onClick={handleConnect}>
        Connect with Twitch
      </Button>
    </div>
  )
}
