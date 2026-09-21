declare module "virtual:changelog" {
  import type { ChangelogVersion } from "@/lib/changelog-parser"

  export const changelog: ChangelogVersion[]
}
