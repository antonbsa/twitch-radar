import { expectTypeOf, test } from "vitest"
import type { z } from "zod"
import type { CategoryDto } from "../../apps/api/src/contracts/categories"
import type { FollowedChannelDto } from "../../apps/api/src/contracts/channels"
import type { UserDto } from "../../apps/api/src/contracts/me"
import type { PushSubscriptionDto } from "../../apps/api/src/contracts/push"
import type {
  BroadcasterMuteDto,
  NotificationSnoozeDto,
} from "../../apps/api/src/contracts/notifications"
import type {
  ChannelPreferenceDto,
  GlobalPreferenceDto,
  GlobalPreferenceExclusionDto,
  PreferencesDto,
} from "../../apps/api/src/contracts/preferences"
import type {
  BroadcasterMute,
  NotificationSnooze,
} from "../../apps/web/src/types/notification"
import type { PushSubscriptionRecord } from "../../apps/web/src/types/push"
import type { FollowedChannel } from "../../apps/web/src/types/channel"
import type {
  Category,
  ChannelPreference,
  GlobalPreference,
  GlobalPreferenceExclusion,
  PreferencesResponse,
} from "../../apps/web/src/types/preference"
import type { User as WebUser } from "../../apps/web/src/types/user"

test("web User mirrors the API wire shape (ADR 0067)", () => {
  expectTypeOf<WebUser>().toEqualTypeOf<z.infer<typeof UserDto>>()
})

test("web FollowedChannel mirrors the API wire shape", () => {
  expectTypeOf<FollowedChannel>().toEqualTypeOf<
    z.infer<typeof FollowedChannelDto>
  >()
})

test("web Category mirrors the API wire shape", () => {
  expectTypeOf<Category>().toEqualTypeOf<z.infer<typeof CategoryDto>>()
})

test("web preference types mirror the API wire shapes", () => {
  expectTypeOf<ChannelPreference>().toEqualTypeOf<
    z.infer<typeof ChannelPreferenceDto>
  >()
  expectTypeOf<GlobalPreferenceExclusion>().toEqualTypeOf<
    z.infer<typeof GlobalPreferenceExclusionDto>
  >()
  expectTypeOf<GlobalPreference>().toEqualTypeOf<
    z.infer<typeof GlobalPreferenceDto>
  >()
  expectTypeOf<PreferencesResponse>().toEqualTypeOf<
    z.infer<typeof PreferencesDto>
  >()
})

test("web notification types mirror the API wire shapes", () => {
  expectTypeOf<NotificationSnooze>().toEqualTypeOf<
    z.infer<typeof NotificationSnoozeDto>
  >()
  expectTypeOf<BroadcasterMute>().toEqualTypeOf<
    z.infer<typeof BroadcasterMuteDto>
  >()
})

test("web PushSubscriptionRecord mirrors the API wire shape", () => {
  expectTypeOf<PushSubscriptionRecord>().toEqualTypeOf<
    z.infer<typeof PushSubscriptionDto>
  >()
})
