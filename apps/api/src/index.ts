import type { Env } from "./env";
import { createApp } from "./http/router";

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    console.log("Queue batch received", {
      queue: batch.queue,
      messages: batch.messages.length,
      environment: env.ENVIRONMENT ?? "local"
    });
  }
} satisfies ExportedHandler<Env>;
