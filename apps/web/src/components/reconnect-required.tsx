import { useLanguage } from "@/context/language-context"

export function ReconnectRequired() {
  const { t } = useLanguage()
  return (
    <div className="px-4 py-6 text-sm text-muted-foreground">
      <p>{t("reconnect.message")}</p>
      <a
        href="/api/auth/twitch/start"
        className="mt-1 inline-block text-primary underline"
      >
        {t("reconnect.cta")}
      </a>
    </div>
  )
}
