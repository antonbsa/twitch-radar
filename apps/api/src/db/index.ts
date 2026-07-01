import { createDatabaseClient } from "./client"
import { ChannelStateRepository } from "./repositories/channel-state"
import { FollowedChannelsRepository } from "./repositories/followed-channels"
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

  constructor(d1: D1Database) {
    const db = createDatabaseClient(d1)
    this.users = new UsersRepository(db)
    this.pushSubscriptions = new PushSubscriptionsRepository(db)
    this.twitchTokens = new TwitchTokensRepository(db)
    this.followedChannels = new FollowedChannelsRepository(db)
    this.channelState = new ChannelStateRepository(db)
  }
}
