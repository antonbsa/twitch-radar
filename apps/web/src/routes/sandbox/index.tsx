import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { SANDBOX_PERSONAS, useSandboxLogin } from "@/hooks/use-sandbox-login"
import { showMutationErrorToast } from "@/lib/error-toast"
import { SandboxEvents } from "@/routes/sandbox/components/sandbox-events"

/** Dev/preview only (ADR 0046): one button per persona, no credentials. */
export function SandboxPage() {
  const { t } = useLanguage()
  const { user, refetch } = useAuth()
  const navigate = useNavigate()
  const login = useSandboxLogin()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">{t("sandbox.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("sandbox.tagline")}</p>
      </div>
      <ul className="space-y-3">
        {SANDBOX_PERSONAS.map((persona) => (
          <li key={persona}>
            <Button
              variant="outline"
              className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
              disabled={login.isPending}
              onClick={() =>
                login.mutate(persona, {
                  onSuccess: async () => {
                    await refetch()
                    navigate("/channels")
                  },
                  onError: (error) =>
                    showMutationErrorToast(error, t("sandbox.loginFailed")),
                })
              }
            >
              <span className="font-medium">
                {t(`sandbox.persona.${persona}`)}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {t(`sandbox.persona.${persona}.description`)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {user?.id.startsWith("usr_sandbox_") && <SandboxEvents />}
    </div>
  )
}
