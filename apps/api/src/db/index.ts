import { createDatabaseClient } from "./client"
import { ChannelCategoryPreferencesRepository } from "./repositories/channel-category-preferences"
import { ChannelStateRepository } from "./repositories/channel-state"
import { EventsubSubscriptionsRepository } from "./repositories/eventsub-subscriptions"
import { FollowedChannelsRepository } from "./repositories/followed-channels"
import { GlobalCategoryPreferencesRepository } from "./repositories/global-category-preferences"
import { MonitoredChannelsRepository } from "./repositories/monitored-channels"
import { PushSubscriptionsRepository } from "./repositories/push-subscriptions"
import { TwitchTokensRepository } from "./repositories/twitch-tokens"
import { UsersRepository } from "./repositories/users"

export { createDatabaseClient }

export class Database {
  readonly users: UsersRepository
  readonly pushSubscriptions: PushSubscriptionsRepository
  readonly twitchTokens: TwitchTokensRepository
  readonly followedChannels: FollowedChannelsRepository
  readonly channelState: ChannelStateRepository
  readonly channelCategoryPreferences: ChannelCategoryPreferencesRepository
  readonly globalCategoryPreferences: GlobalCategoryPreferencesRepository
  readonly monitoredChannels: MonitoredChannelsRepository
  readonly eventsubSubscriptions: EventsubSubscriptionsRepository

  constructor(d1: D1Database) {
    const db = createDatabaseClient(d1)
    this.users = new UsersRepository(db)
    this.pushSubscriptions = new PushSubscriptionsRepository(db)
    this.twitchTokens = new TwitchTokensRepository(db)
    this.followedChannels = new FollowedChannelsRepository(db)
    this.channelState = new ChannelStateRepository(db)
    this.channelCategoryPreferences = new ChannelCategoryPreferencesRepository(
      db,
    )
    this.globalCategoryPreferences = new GlobalCategoryPreferencesRepository(db)
    this.monitoredChannels = new MonitoredChannelsRepository(db)
    this.eventsubSubscriptions = new EventsubSubscriptionsRepository(db)
  }
}
