import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language-context"

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const wasDeclined = searchParams.get("error") === "twitch_declined"
  const { t } = useLanguage()

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
      inputs after the redirect. */}
      <Button size="lg" asChild>
        <a href="/api/auth/twitch/start">{t("login.connect")}</a>
      </Button>
    </div>
  )
}
