import { Button } from "@/components/ui/button"

export function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Twitch Radar</h1>
        <p className="text-sm text-muted-foreground">
          Get notified when channels you follow go live in the categories you
          care about.
        </p>
      </div>
      {/* A real <a> click, not a JS-driven window.location assignment: iOS
      standalone PWAs only carry the trusted-navigation flag through a
      redirect chain when it originates from a native link click, and losing
      it is what stops the soft keyboard from opening on Twitch's login
      inputs after the redirect. */}
      <Button size="lg" asChild>
        <a href="/api/auth/twitch/start">Connect with Twitch</a>
      </Button>
    </div>
  )
}
