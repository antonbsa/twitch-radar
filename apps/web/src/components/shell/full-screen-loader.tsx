import { useLanguage } from "@/context/language-context"

export function FullScreenLoader() {
  const { t } = useLanguage()
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      {t("common.loading")}
    </div>
  )
}
