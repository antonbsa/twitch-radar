import { useState } from "react"
import { toast } from "sonner"
import categories from "@fixtures/sandbox/categories.json"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/context/language-context"
import { useFollowedChannels } from "@/hooks/use-channels"
import {
  useSandboxEvent,
  type SandboxEventInput,
  type SandboxEventResult,
} from "@/hooks/use-sandbox-event"
import { showMutationErrorToast } from "@/lib/error-toast"

/** Per-channel "go live" / "switch category" controls for the signed-in persona (ADR 0046). */
export function SandboxEvents() {
  const { t } = useLanguage()
  const { data: channels = [] } = useFollowedChannels()
  const event = useSandboxEvent()
  const [categoryId, setCategoryId] = useState(categories[0].id)

  const send = (type: SandboxEventInput["type"], broadcasterUserId: string) =>
    event.mutate(
      { type, broadcasterUserId, categoryId },
      {
        onSuccess: ({ data }) => toast.message(describe(data)),
        onError: (error) =>
          showMutationErrorToast(error, t("sandbox.events.failed")),
      },
    )

  const describe = (result: SandboxEventResult) =>
    t(
      result.notified
        ? "sandbox.events.notified"
        : result.change_type
          ? "sandbox.events.notNotified"
          : "sandbox.events.noChange",
    )

  return (
    <section className="space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">{t("sandbox.events.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("sandbox.events.tagline")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm">{t("sandbox.events.category")}</span>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {channels.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("sandbox.events.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {channels.map((channel) => (
            <li
              key={channel.broadcaster_user_id}
              className="space-y-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">
                  {channel.broadcaster_display_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {channel.is_live
                    ? t("sandbox.events.live", {
                        category: channel.category_name ?? "",
                      })
                    : t("sandbox.events.offline")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={event.isPending}
                  onClick={() => send("go_live", channel.broadcaster_user_id)}
                >
                  {t("sandbox.events.goLive")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={event.isPending || !channel.is_live}
                  onClick={() =>
                    send("switch_category", channel.broadcaster_user_id)
                  }
                >
                  {t("sandbox.events.switchCategory")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
