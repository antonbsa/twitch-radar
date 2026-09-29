declare module "virtual:changelog" {
  import type { ChangelogVersion } from "@/lib/changelog-parser"
  import type { Language } from "@/lib/i18n"

  export const changelogs: Record<Language, ChangelogVersion[]>
}
