import { createDatabaseClient } from "./client";
import { PushSubscriptionsRepository } from "./repositories/push-subscriptions";
import { UsersRepository } from "./repositories/users";

export { createDatabaseClient };

export class Database {
  readonly users: UsersRepository;
  readonly pushSubscriptions: PushSubscriptionsRepository;

  constructor(d1: D1Database) {
    const db = createDatabaseClient(d1);
    this.users = new UsersRepository(db);
    this.pushSubscriptions = new PushSubscriptionsRepository(db);
  }
}
