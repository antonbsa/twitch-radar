import { useSearchParams } from "react-router"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"
import { useNavigationPending } from "@/hooks/use-navigation-pending"

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const wasDeclined = searchParams.get("error") === "twitch_declined"
  const { t } = useLanguage()
  const [isConnecting, markConnecting] = useNavigationPending()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("login.tagline")}</p>
      </div>
      {wasDeclined && (
        <p className="text-sm text-destructive">{t("login.declined")}</p>
      )}
      {/* A real <a> click, not a JS-driven window.location assignment: iOS
      standalone PWAs only carry the trusted-navigation flag through a
      redirect chain when it originates from a native link click, and losing
      it is what stops the soft keyboard from opening on Twitch's login
      inputs after the redirect. The pending state only changes what the
      link renders, never how it navigates. */}
      <Button
        size="lg"
        className="aria-disabled:pointer-events-none aria-disabled:opacity-70"
        asChild
      >
        <a
          href="/api/auth/twitch/start"
          aria-busy={isConnecting}
          aria-disabled={isConnecting}
          onClick={markConnecting}
        >
          {isConnecting && <Loader2Icon className="animate-spin" />}
          {t(isConnecting ? "login.connecting" : "login.connect")}
        </a>
      </Button>
    </div>
  )
}
