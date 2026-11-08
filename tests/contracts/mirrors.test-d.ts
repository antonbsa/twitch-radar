import { expectTypeOf, test } from "vitest"
import type { z } from "zod"
import type { UserDto } from "../../apps/api/src/contracts/me"
import type { User as WebUser } from "../../apps/web/src/types/user"

test("web User mirrors the API wire shape (ADR 0067)", () => {
  expectTypeOf<WebUser>().toEqualTypeOf<z.infer<typeof UserDto>>()
})
